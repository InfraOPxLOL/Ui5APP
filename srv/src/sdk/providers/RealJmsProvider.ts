import type { IJmsProvider } from "../../core/providers/IJmsProvider.js";
import type {
  JmsMessagePayload,
  JmsOperationResult,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
  QueueRuntimeInfo,
  QueuedMessage,
} from "../../core/providers/types.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { UpstreamError } from "../../core/errors/UpstreamError.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { TenantContext } from "../models/TenantContext.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { csrfWriteHeaders, fetchCsrfHandshake } from "../rest/CsrfHandshake.js";
import { toODataV2KeyLiteral } from "./RealProviderSupport.js";

/**
 * Raw shape of one `Queues` entity (OData v2 serializes every `Edm.Int64` as a JSON *string*,
 * e.g. `"NumbOfMsgs": "0"`, `"Active": "1"` — verified against a live tenant).
 */
interface CpiQueue {
  readonly Name: string;
  readonly NumbOfMsgs?: string | number;
  readonly Size?: string | number;
  readonly State?: string | number;
  readonly FillGrade?: string | number;
  readonly Active?: string | number;
  readonly Exclusive?: string | number;
}

/** Raw shape of one `MessagingQueues` entity (`numberOfMessages` is Int64-as-string; `active` is a real boolean). */
interface CpiMessagingQueue {
  readonly queueName: string;
  readonly numberOfMessages?: string | number;
  readonly active?: boolean;
  readonly exclusive?: boolean;
}

/** Raw shape of one `MessagingMessages` entity. All timestamps are epoch milliseconds (Int64-as-string). */
interface CpiMessagingMessage {
  readonly jmsMessageId: string;
  readonly queueName: string;
  readonly failed?: boolean;
  readonly mplId?: string;
  readonly createdAt?: string | number;
  readonly retryCount?: string | number;
  readonly nextRetry?: string | number;
  readonly overdueAt?: string | number;
  readonly expirationDate?: string | number;
  readonly sender?: string;
  readonly receiver?: string;
  readonly messageType?: string;
  readonly applicationId?: string;
  readonly correlationId?: string;
}

/** The OData v2 collection envelope (`{"d":{"results":[...]}}`) message listings arrive in. */
interface ODataV2Collection<T> {
  readonly d?: { readonly results?: readonly T[] };
}

/**
 * The entity sets and function imports this provider calls — the JMS surface of the Cloud
 * Integration OData API, as confirmed by the tenant's own `$metadata` and live probing:
 *
 * - `Queues` — queue discovery and runtime state (`NumbOfMsgs`, `FillGrade`, `Active`). Richer than
 *   `MessagingQueues`, which lacks a fill-grade/utilization signal.
 * - `MessagingQueues` — anchors the message navigation (`MessagingQueues('q')/MessagingMessages`,
 *   the only supported way to list messages; a top-level message listing is not implemented).
 * - `MessagingMessages` — addresses one message by its composite key
 *   (`jmsMessageId` + `queueName`) for reads and DELETE.
 * - `RetryMessagingMessages` — the POST function import executing message retries.
 * - `MoveMessagingMessages` — the POST function import moving specific messages between queues
 *   (`sourceQueue` + `targetQueue` + `jmsMessageIds`). Backs dead-letter recovery, which must move a
 *   parked message back to its processing queue before it can be retried.
 *
 * Note the tenant `$metadata` also declares a legacy `JmsQueues` entity set which responds
 * `501 Not Implemented` when queried directly — declared-in-metadata does not mean implemented,
 * which is why these names stay constructor-configurable (architecture: Destination Integration,
 * §1 — "No URLs should be hardcoded", applied to entity-set names too).
 */
export interface JmsProviderEndpoints {
  readonly queueEntitySet: string;
  readonly messagingQueueEntitySet: string;
  readonly messageEntitySet: string;
  readonly retryFunctionImport: string;
  readonly moveFunctionImport: string;
}

const DEFAULT_JMS_ENDPOINTS: JmsProviderEndpoints = {
  queueEntitySet: "Queues",
  messagingQueueEntitySet: "MessagingQueues",
  messageEntitySet: "MessagingMessages",
  retryFunctionImport: "RetryMessagingMessages",
  moveFunctionImport: "MoveMessagingMessages",
};

/**
 * Parameter names sent to {@link JmsProviderEndpoints.moveFunctionImport}. Kept beside the endpoint
 * names (and equally overridable via the constructor) because they are upstream contract details:
 * if a tenant's `$metadata` spells them differently, that is a configuration correction, not a code
 * change — the same reasoning that made the entity-set names configurable in the first place.
 */
export interface JmsMoveParameterNames {
  readonly sourceQueue: string;
  readonly targetQueue: string;
  readonly messageIds: string;
}

const DEFAULT_MOVE_PARAMETERS: JmsMoveParameterNames = {
  sourceQueue: "sourceQueue",
  targetQueue: "targetQueue",
  messageIds: "jmsMessageIds",
};

/**
 * Message listing does not support `$top`/`$skip` (silently ignored) — the server applies a fixed
 * row cap of {@link MIN_MESSAGE_PAGE_SIZE} overridable per request via `pageSize` in the range
 * 100–10,000. Offset paging is therefore emulated client-side: fetch `skip + top` rows (clamped
 * into the server's accepted range) and slice.
 */
const MIN_MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGE_SIZE = 10_000;
/** The reply body of `MoveMessagingMessages` / `RetryMessagingMessages` / message DELETE. */
interface CpiOperationReply {
  readonly operation?: string;
  readonly processedCount?: number | string;
}

/** Batch size for purge's list-then-delete loop. */
const PURGE_BATCH_SIZE = 1_000;
/** Safety cap so a queue receiving new messages faster than purge deletes them cannot loop forever. */
const MAX_PURGE_BATCHES = 100;

/**
 * Live implementation of {@link IJmsProvider} against the Cloud Integration JMS OData API
 * (`Queues` + `MessagingQueues`/`MessagingMessages` + `RetryMessagingMessages` — see
 * {@link JmsProviderEndpoints} for exactly which surface backs which operation, and why).
 *
 * Field-mapping honesty: `Queues` exposes no per-queue consumer count, so
 * {@link QueueRuntimeInfo.consumerCount} is reported as `undefined` (unknown), never fabricated;
 * `MessagingMessages` exposes no per-message size, so {@link QueuedMessage.sizeBytes} is likewise
 * `undefined`.
 *
 * Every modifying call (move, retry, delete) first performs the tenant's CSRF handshake — without a
 * token the tenant answers `403 CSRF token validation failed` and moves nothing.
 */
export class RealJmsProvider implements IJmsProvider {
  private readonly odataClient: ODataClient;
  private readonly restClient: SdkRestClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    private readonly httpClient: IHttpClient,
    private readonly endpoints: JmsProviderEndpoints = DEFAULT_JMS_ENDPOINTS,
    private readonly moveParameters: JmsMoveParameterNames = DEFAULT_MOVE_PARAMETERS,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async getQueueStates(
    context: ProviderContext,
    queueNames: readonly string[],
  ): Promise<readonly QueueRuntimeInfo[]> {
    return this.pipeline.run({
      operationName: "jms.getQueueStates",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const results: QueueRuntimeInfo[] = [];
        for (const queueName of queueNames) {
          // The contract omits unknown queues: `getEntity` already maps a 404 to `undefined`; a 400
          // is the tenant rejecting the configured name outright (only [A-Za-z0-9_]{1,80} is a
          // legal queue name), which equally means the queue cannot exist there. Any other failure
          // (auth, network, 5xx) still aborts the whole call.
          let raw: CpiQueue | undefined;
          try {
            raw = await this.odataClient.getEntity<CpiQueue>(
              `${tenant.baseUrl}/${this.endpoints.queueEntitySet}(${toODataV2KeyLiteral(queueName)})`,
              tenant,
              opContext,
            );
          } catch (error) {
            if (!RealJmsProvider.isQueueNameRejected(error)) {
              throw error;
            }
          }
          if (raw !== undefined) {
            results.push(RealJmsProvider.toQueueDomain(raw));
          }
        }
        return results;
      },
    });
  }

  /** @inheritdoc */
  public async discoverQueues(context: ProviderContext): Promise<readonly QueueRuntimeInfo[]> {
    return this.pipeline.run({
      operationName: "jms.discoverQueues",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const all = await this.odataClient.queryAllPages<CpiQueue>(
          `${tenant.baseUrl}/${this.endpoints.queueEntitySet}`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return all.map(RealJmsProvider.toQueueDomain);
      },
    });
  }

  /** @inheritdoc */
  public async listMessages(
    context: ProviderContext,
    queueName: string,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<QueuedMessage>> {
    return this.pipeline.run({
      operationName: "jms.listMessages",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const pageSize = RealJmsProvider.clampPageSize(page.skip + page.top);
        const fetched = await this.fetchMessages(tenant, opContext, queueName, pageSize);
        const items = fetched
          .slice(page.skip, page.skip + page.top)
          .map(RealJmsProvider.toMessageDomain);
        // A short batch is authoritative for the total; a full batch means more rows exist beyond
        // the requested window, so read the queue's own live message count instead.
        const total =
          fetched.length < pageSize
            ? fetched.length
            : await this.fetchQueueMessageCount(tenant, opContext, queueName, fetched.length);
        return { items, total };
      },
    });
  }

  /** @inheritdoc */
  public async deleteMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<void> {
    return this.pipeline.run({
      operationName: "jms.deleteMessage",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const csrf = await fetchCsrfHandshake(this.httpClient, tenant, opContext);
        await this.restClient.delete(this.messageUrl(tenant, queueName, messageId), opContext, {
          headers: csrfWriteHeaders(tenant, csrf),
        });
      },
    });
  }

  /** @inheritdoc */
  public async purgeQueue(context: ProviderContext, queueName: string): Promise<number> {
    return this.pipeline.run({
      operationName: "jms.purgeQueue",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        let removed = 0;
        for (let batch = 0; batch < MAX_PURGE_BATCHES; batch += 1) {
          const messages = await this.fetchMessages(tenant, opContext, queueName, PURGE_BATCH_SIZE);
          if (messages.length === 0) {
            break;
          }
          const headers = csrfWriteHeaders(
            tenant,
            await fetchCsrfHandshake(this.httpClient, tenant, opContext),
          );
          for (const message of messages) {
            await this.restClient.delete(
              this.messageUrl(tenant, queueName, message.jmsMessageId),
              opContext,
              { headers },
            );
            removed += 1;
          }
        }
        return removed;
      },
    });
  }

  /** @inheritdoc */
  public async retryMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<JmsOperationResult> {
    return this.pipeline.run({
      operationName: "jms.retryMessage",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const csrf = await fetchCsrfHandshake(this.httpClient, tenant, opContext);
        const reply = await this.restClient.post<CpiOperationReply>(
          `${tenant.baseUrl}/${this.endpoints.retryFunctionImport}`,
          { queueName, jmsMessageId: messageId },
          opContext,
          { headers: csrfWriteHeaders(tenant, csrf) },
        );
        return { processedCount: RealJmsProvider.processedCount(reply.data) };
      },
    });
  }

  /** @inheritdoc */
  public async moveMessages(
    context: ProviderContext,
    sourceQueue: string,
    targetQueue: string,
    messageIds: readonly string[],
  ): Promise<JmsOperationResult> {
    if (messageIds.length === 0) {
      return { processedCount: 0 };
    }
    return this.pipeline.run({
      operationName: "jms.moveMessages",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const csrf = await fetchCsrfHandshake(this.httpClient, tenant, opContext);
        const reply = await this.restClient.post<CpiOperationReply>(
          `${tenant.baseUrl}/${this.endpoints.moveFunctionImport}`,
          {
            [this.moveParameters.sourceQueue]: sourceQueue,
            [this.moveParameters.targetQueue]: targetQueue,
            [this.moveParameters.messageIds]: [...messageIds],
          },
          opContext,
          { headers: csrfWriteHeaders(tenant, csrf) },
        );
        return { processedCount: RealJmsProvider.processedCount(reply.data) };
      },
    });
  }

  /** @inheritdoc */
  public async getMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<QueuedMessage | undefined> {
    return this.pipeline.run({
      operationName: "jms.getMessage",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.getEntity<CpiMessagingMessage>(
          this.messageUrl(tenant, queueName, messageId),
          tenant,
          opContext,
        );
        return raw === undefined ? undefined : RealJmsProvider.toMessageDomain(raw);
      },
    });
  }

  /** @inheritdoc */
  public async getMessagePayload(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<JmsMessagePayload | undefined> {
    return this.pipeline.run({
      operationName: "jms.getMessagePayload",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        try {
          const binary = await this.restClient.getBinary(
            `${this.messageUrl(tenant, queueName, messageId)}/$value`,
            opContext,
            { headers: tenant.headers },
          );
          return RealJmsProvider.decodePayload(binary.data);
        } catch (error) {
          if (error instanceof HttpError && error.statusCode === 404) {
            return undefined;
          }
          throw error;
        }
      },
    });
  }

  // --- Shared fetch helpers -------------------------------------------------

  /**
   * Lists one batch of a queue's messages via the only supported path,
   * `MessagingQueues('q')/MessagingMessages?pageSize=N` (OData system query options like `$filter`
   * are rejected with 400 on this surface; `pageSize` is its own, non-`$` parameter).
   */
  private async fetchMessages(
    tenant: TenantContext,
    opContext: OperationContext,
    queueName: string,
    pageSize: number,
  ): Promise<readonly CpiMessagingMessage[]> {
    const url = `${tenant.baseUrl}/${this.endpoints.messagingQueueEntitySet}(${toODataV2KeyLiteral(queueName)})/${this.endpoints.messageEntitySet}`;
    const response = await this.restClient.get<ODataV2Collection<CpiMessagingMessage>>(
      url,
      opContext,
      {
        headers: RealJmsProvider.jsonHeaders(tenant),
        query: { pageSize: String(RealJmsProvider.clampPageSize(pageSize)) },
      },
    );
    return response.data?.d?.results ?? [];
  }

  /** Reads a queue's live `numberOfMessages`; falls back to the fetched count if the queue read fails. */
  private async fetchQueueMessageCount(
    tenant: TenantContext,
    opContext: OperationContext,
    queueName: string,
    fallback: number,
  ): Promise<number> {
    const raw = await this.odataClient.getEntity<CpiMessagingQueue>(
      `${tenant.baseUrl}/${this.endpoints.messagingQueueEntitySet}(${toODataV2KeyLiteral(queueName)})`,
      tenant,
      opContext,
    );
    return raw === undefined ? fallback : RealJmsProvider.toCount(raw.numberOfMessages);
  }

  /** Builds the composite-key URL addressing one message (`jmsMessageId` + `queueName`). */
  private messageUrl(tenant: TenantContext, queueName: string, messageId: string): string {
    return `${tenant.baseUrl}/${this.endpoints.messageEntitySet}(jmsMessageId=${toODataV2KeyLiteral(messageId)},queueName=${toODataV2KeyLiteral(queueName)})`;
  }

  // --- Mapping ---------------------------------------------------------------

  private static toQueueDomain(raw: CpiQueue): QueueRuntimeInfo {
    return {
      queueName: raw.Name,
      state: RealJmsProvider.toCount(raw.Active) === 1 ? "STARTED" : "STOPPED",
      messageCount: RealJmsProvider.toCount(raw.NumbOfMsgs),
      // `Queues` exposes no per-queue consumer count — unknown, never fabricated.
      consumerCount: undefined,
      capacityUsedPct: RealJmsProvider.toCount(raw.FillGrade),
    };
  }

  private static toMessageDomain(raw: CpiMessagingMessage): QueuedMessage {
    return {
      messageId: raw.jmsMessageId,
      queueName: raw.queueName,
      enqueuedAt: RealJmsProvider.epochMsToIso(raw.createdAt) ?? "",
      retryCount: RealJmsProvider.toCount(raw.retryCount),
      // `MessagingMessages` exposes no size property — unknown, never fabricated.
      sizeBytes: undefined,
      failed: raw.failed,
      mplId: RealJmsProvider.text(raw.mplId),
      correlationId: RealJmsProvider.text(raw.correlationId),
      sender: RealJmsProvider.text(raw.sender),
      receiver: RealJmsProvider.text(raw.receiver),
      messageType: RealJmsProvider.text(raw.messageType),
      applicationId: RealJmsProvider.text(raw.applicationId),
      nextRetryAt: RealJmsProvider.optionalEpochToIso(raw.nextRetry),
      expiresAt: RealJmsProvider.optionalEpochToIso(raw.expirationDate),
    };
  }

  /** Reads `processedCount` (an `Edm.Int64`, so possibly a string) from an operation reply. */
  private static processedCount(reply: CpiOperationReply | undefined): number | undefined {
    if (reply?.processedCount === undefined) {
      return undefined;
    }
    const count = Number(reply.processedCount);
    return Number.isNaN(count) ? undefined : count;
  }

  /**
   * A JMS body carries no content type, so it is shown as text when it decodes as UTF-8 without
   * control characters (XML, JSON, EDI, CSV), and as base64 otherwise.
   */
  private static decodePayload(bytes: Uint8Array): JmsMessagePayload {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      // eslint-disable-next-line no-control-regex -- control characters are what we look for.
      if (!/[\u0000-\u0008\u000E-\u001F]/.test(text)) {
        return { content: text, encoding: "text", sizeBytes: bytes.byteLength };
      }
    } catch {
      // not UTF-8 — fall through to base64
    }
    return {
      content: Buffer.from(bytes).toString("base64"),
      encoding: "base64",
      sizeBytes: bytes.byteLength,
    };
  }

  /** Like {@link epochMsToIso}, but `0` (the broker's "not set") reads as absent. */
  private static optionalEpochToIso(value: string | number | undefined): string | undefined {
    return value === undefined || Number(value) <= 0
      ? undefined
      : RealJmsProvider.epochMsToIso(value);
  }

  private static text(value: string | undefined): string | undefined {
    return value === undefined || value === "" ? undefined : value;
  }

  /** Parses an OData v2 numeric value (`Edm.Int64` arrives as a JSON string) into a number, `0` when absent. */
  private static toCount(value: string | number | undefined): number {
    if (value === undefined) {
      return 0;
    }
    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /** Converts an epoch-milliseconds value (Int64-as-string) to an ISO 8601 string. */
  private static epochMsToIso(value: string | number | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    const epochMs = typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isNaN(epochMs) ? undefined : new Date(epochMs).toISOString();
  }

  private static clampPageSize(requested: number): number {
    return Math.min(Math.max(requested, MIN_MESSAGE_PAGE_SIZE), MAX_MESSAGE_PAGE_SIZE);
  }

  /** Whether an error is the tenant's 400 rejecting a queue name it considers invalid. */
  private static isQueueNameRejected(error: unknown): boolean {
    return error instanceof UpstreamError && error.upstreamStatus === 400;
  }

  /**
   * Merges `Accept: application/json` onto the tenant's auth headers — without it this OData v2
   * surface answers in Atom/XML (same Olingo-stack behaviour `ODataClient.jsonHeaders` documents).
   */
  private static jsonHeaders(tenant: TenantContext): Record<string, string> {
    return { ...tenant.headers, Accept: "application/json" };
  }
}
