import type { MonitoringClient } from "../../sdk/client/MonitoringClient.js";
import type {
  MessageErrorDetail,
  MessageLogFilter,
  MessageProcessingLog,
} from "../../core/providers/types.js";
import type { MessageDetails, MessageSummary } from "../dto/MessageDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import { OperationsCache } from "../cache/index.js";
import { toProviderPage, type OperationsQuery } from "../models/index.js";
import { FilterEngine } from "./FilterEngine.js";
import {
  calculateDurationMs,
  formatDurationHuman,
  humanReadableStatus,
  severityOfStatus,
} from "../transform/index.js";

/**
 * Upper bound on how many messages {@link MessageEngine.queryMessages} fetches from the SDK before
 * applying the criteria the SDK's own `MessageLogFilter` cannot express (`messageType`,
 * `applicationId`, `sender`, `receiver`, `customStatus`, duration range) and paginating in memory.
 *
 * This is a documented, honest limitation, not an oversight: today's OData v1 Monitoring API (and
 * this SDK's `MessageLogFilter`) only support server-side filtering on status/integration
 * flow/date-range/free-text search. Filtering by the remaining fields, and correct pagination over
 * the *combined* result, therefore happens over this bounded working-set window rather than over
 * the tenant's entire message history — exactly how `StatisticsEngine`'s aggregations also operate
 * over a bounded live window.
 */
const DEFAULT_WORKING_SET_SIZE = 500;

interface WorkingSetResult {
  readonly items: readonly MessageSummary[];
  readonly total: number;
}

/**
 * The complete message abstraction (architecture: Phase 6, Message Engine, §2). The only place any
 * future module reads message processing logs from — always through `MessageSummary`/
 * `MessageDetails`, never through `sdk.monitoring`'s `MessageProcessingLog` directly.
 */
export class MessageEngine {
  public constructor(
    private readonly client: MonitoringClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Queries messages: pushes down what the SDK can filter server-side (`status`, `integrationFlow`,
   * `dateFrom`/`dateTo`, `search`), applies the remaining {@link OperationsQuery} criteria and sort
   * in memory via {@link FilterEngine}, then paginates the combined result.
   * @param query the query (see {@link OperationsQueryBuilder}).
   * @returns a page of {@link MessageSummary} plus the total match count.
   */
  public async queryMessages(query: OperationsQuery): Promise<SearchResult<MessageSummary>> {
    const startedAt = Date.now();
    const cacheKey = `message.query:${JSON.stringify(query)}`;
    const workingSet = await this.cache.dedupe(cacheKey, () => this.fetchWorkingSet(query));
    return { items: workingSet.items, total: workingSet.total, tookMs: Date.now() - startedAt };
  }

  /**
   * Reads a single message's full details, including its error details when it failed.
   * @param messageId the MPL message id.
   * @returns the full message details, or `undefined` when unknown.
   */
  public async getMessage(messageId: string): Promise<MessageDetails | undefined> {
    return this.cache.dedupe(`message.get:${messageId}`, async () => {
      const log = await this.client.getMessageLog(messageId);
      if (log === undefined) {
        return undefined;
      }
      const summary = MessageEngine.toSummary(log);
      const [errorDetails, customHeaders] = await Promise.all([
        summary.severity === "error" ? this.client.getErrorDetails(messageId) : Promise.resolve([]),
        this.client.getCustomHeaders(messageId),
      ]);
      const details: MessageDetails = {
        ...summary,
        mplId: log.messageId,
        errorDetails,
        // No `core/providers` contract exposes SAP-standard (system) headers per-message today —
        // `sapStandardHeaders` stays an honest, documented gap; `customHeaders` is real.
        sapStandardHeaders: {},
        customHeaders: Object.fromEntries(customHeaders.map((header) => [header.name, header.value])),
      };
      return details;
    });
  }

  /** Thin projection: the message's status. See {@link getMessage}. */
  public async getMessageStatus(messageId: string): Promise<string | undefined> {
    return (await this.getMessage(messageId))?.status;
  }

  /** Thin projection: the message's processing duration in milliseconds. See {@link getMessage}. */
  public async getProcessingDuration(messageId: string): Promise<number | undefined> {
    return (await this.getMessage(messageId))?.processingTimeMs;
  }

  /**
   * Reads a failed message's error details directly (without the full {@link getMessage} round trip).
   * @param messageId the MPL message id.
   * @returns the error details; empty when the message has none.
   */
  public async getErrorDetails(messageId: string): Promise<readonly MessageErrorDetail[]> {
    return this.cache.dedupe(`message.errorDetails:${messageId}`, () =>
      this.client.getErrorDetails(messageId),
    );
  }

  /**
   * Finds every message sharing a correlation id, within the same bounded working set
   * {@link queryMessages} operates over (see {@link DEFAULT_WORKING_SET_SIZE}'s doc comment).
   * @param correlationId the correlation id to match.
   * @returns the matching messages.
   */
  public async findByCorrelationId(correlationId: string): Promise<readonly MessageSummary[]> {
    return this.cache.dedupe(`message.byCorrelation:${correlationId}`, async () => {
      const page = await this.client.queryMessageLogs(
        {},
        { skip: 0, top: DEFAULT_WORKING_SET_SIZE },
      );
      return page.items
        .map(MessageEngine.toSummary)
        .filter((item) => item.correlationId === correlationId);
    });
  }

  private async fetchWorkingSet(query: OperationsQuery): Promise<WorkingSetResult> {
    const filter = MessageEngine.toProviderFilter(query);
    const page = await this.client.queryMessageLogs(filter, {
      skip: 0,
      top: DEFAULT_WORKING_SET_SIZE,
    });
    const summaries = page.items.map(MessageEngine.toSummary);
    const filtered = FilterEngine.forMessages().apply(
      summaries,
      MessageEngine.toFilterCriteria(query),
    );
    const sorted = MessageEngine.sort(filtered, query);
    const providerPage = toProviderPage(query);
    return {
      items: sorted.slice(providerPage.skip, providerPage.skip + providerPage.top),
      total: sorted.length,
    };
  }

  private static toProviderFilter(query: OperationsQuery): MessageLogFilter {
    return {
      status: query.status,
      integrationFlow: query.integrationFlow,
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    };
  }

  private static toFilterCriteria(query: OperationsQuery): Readonly<Record<string, unknown>> {
    return {
      messageType: query.messageType,
      applicationId: query.applicationId,
      sender: query.sender,
      receiver: query.receiver,
      customStatus: query.customStatus,
      durationMinMs: query.durationMinMs,
      durationMaxMs: query.durationMaxMs,
    };
  }

  private static sort(items: readonly MessageSummary[], query: OperationsQuery): MessageSummary[] {
    if (query.sortBy === undefined) {
      return [...items];
    }
    const field = query.sortBy as keyof MessageSummary;
    const direction = query.sortDirection === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const left = a[field];
      const right = b[field];
      if (left === right) {
        return 0;
      }
      if (left === undefined) {
        return 1;
      }
      if (right === undefined) {
        return -1;
      }
      return left > right ? direction : -direction;
    });
  }

  private static toSummary(log: MessageProcessingLog): MessageSummary {
    const processingTimeMs =
      log.processingTimeMs ?? calculateDurationMs(log.startTime, log.endTime);
    return {
      messageId: log.messageId,
      correlationId: log.correlationId,
      integrationFlow: log.integrationFlow,
      status: log.status,
      humanReadableStatus: humanReadableStatus(log.status),
      severity: severityOfStatus(log.status),
      startTime: log.startTime,
      endTime: log.endTime,
      processingTimeMs,
      processingTimeHuman: formatDurationHuman(processingTimeMs),
      sender: log.sender,
      receiver: log.receiver,
      applicationId: log.applicationId,
      messageType: log.messageType,
      customStatus: log.customStatus,
    };
  }
}
