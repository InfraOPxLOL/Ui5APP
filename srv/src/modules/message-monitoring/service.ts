import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { configService } from "../../config/ConfigService.js";
import { OperationsQueryBuilder } from "../../operations/models/index.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { MessageSummary, ExportModel } from "../../operations/dto/index.js";
import type { Severity } from "../../operations/transform/index.js";
import { HttpError } from "../../core/errors/HttpError.js";
import type {
  JmsEligibilityDto,
  JmsRetryCheckDto,
  JmsRetryResultDto,
  MessageContextDto,
  MessageDetailDto,
  MessageExportFormat,
  MessageMonitoringDto,
  MessageMonitoringPage,
  MessageTimelineEntryDto,
  QueueReferenceDto,
  RelatedMessageDimension,
  RelatedMessageGroupDto,
  RetryStatus,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
/** Bound on the working set the service filters/sorts/paginates over — mirrors `MessageEngine`'s own documented limitation. */
const WORKING_SET_SIZE = 500;
/** Bound on how many enabled queues are scanned for a best-effort queue reference. */
const QUEUE_SCAN_TOP = 100;
/** How many certificates the context panel's certificate watch surfaces. */
const CERTIFICATE_WATCH_HORIZON_DAYS = 30;
/** How many recent notifications the context panel surfaces. */
const CONTEXT_NOTIFICATION_LIMIT = 5;
/** Recognized smart-filter presets (§ Smart Filters). */
export type SmartFilter =
  | "failedToday"
  | "currentlyProcessing"
  | "longRunning"
  | "retryCandidates"
  | "businessErrors"
  | "systemErrors"
  | "recentlyFailed";

/** Raw query parameters accepted by {@link MessageMonitoringService.list} (validated upstream). */
export interface MessageListQuery {
  readonly status?: string;
  readonly severity?: Severity;
  readonly sender?: string;
  readonly receiver?: string;
  readonly messageType?: string;
  readonly customStatus?: string;
  readonly applicationId?: string;
  readonly integrationFlow?: string;
  readonly correlationId?: string;
  readonly queue?: string;
  readonly search?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly durationMinMs?: number;
  readonly durationMaxMs?: number;
  readonly smartFilter?: SmartFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: string;
  readonly sortDirection?: "asc" | "desc";
}

const LONG_RUNNING_THRESHOLD_MS = 60_000;
const FUNCTIONAL_ERROR_STATUSES = new Set(["ESCALATED", "RETRY"]);
const TECHNICAL_ERROR_STATUSES = new Set(["FAILED", "ABANDONED", "DISCARDED"]);

/**
 * The two literal, fixed bridge-iFlow names a message's correlation chain passes through when it is
 * JMS-queue-retryable — confirmed against the real tenant's naming convention, not a guess (§ JMS
 * Retry). Matching is case-insensitive but otherwise exact; no wildcard/prefix matching is applied.
 */
const JMS_INGRESS_IFLOW = "IF_JMS_ingress";
const JMS_EGRESS_IFLOW = "IF_JMS_egress";
/** The single, fixed central dead-letter queue JMS-retryable messages fall back to (§ JMS Retry). */
const CENTRAL_DLQ_QUEUE = "Common_JMS_ID_DLQ";
/** The `IF_JMS_ingress` entry's own custom header naming the queue a message should retry from. */
const QUEUE_HEADER_NAME = "CH-Message-Queue";
/**
 * Extracts the queue name from a `CH-Message-Queue` header value, e.g.
 * `📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]`
 * — the trailing `[... = <queue>]` segment, confirmed against a real example value.
 */
const QUEUE_HEADER_VALUE_PATTERN = /\[[^[\]]*=\s*([^\]]+)\]\s*$/;

/**
 * Aggregation service for the Message Investigation Workspace (Phase 9). It is the message-scoped
 * counterpart to `srv/src/modules/operations/service.ts`: it builds a fresh, request-scoped
 * {@link OperationsEngine} per call and composes `engine.message`/`engine.search`/`engine.runtime`/
 * `engine.queue`/`engine.certificate`/`engine.notification`/`engine.attachment`/`engine.header`/
 * `engine.export` into the rich {@link MessageMonitoringDto} shapes the investigation workspace
 * consumes. No SDK, OData or CPI shape ever leaves this layer.
 */
export class MessageMonitoringService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Lists investigation rows: pushes down what {@link OperationsEngine.message} can filter/sort,
   * applies `severity`/`correlationId`/`queue`/smart-filter criteria this domain cannot express
   * server-side over the same bounded working set `MessageEngine` itself uses, then paginates.
   * Per-row `attachmentCount`/`payloadSizeBytes` are populated only for the returned page (bounded,
   * real data — never for the whole working set).
   * @param query the validated list query.
   * @returns the paginated, enriched investigation rows.
   */
  public async list(query: MessageListQuery): Promise<MessageMonitoringPage> {
    const engine = this.engineFactory();
    const resolved = MessageMonitoringService.applySmartFilter(query);
    const page = resolved.page ?? 1;
    const pageSize = resolved.pageSize ?? 50;

    const candidates = await this.resolveCandidates(engine, resolved);
    const filtered = MessageMonitoringService.applyLocalFilters(candidates, resolved);
    const sorted = MessageMonitoringService.sort(filtered, resolved);
    const total = sorted.length;
    const pageItems = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const enriched = await Promise.all(pageItems.map((item) => this.enrichRow(engine, item)));
    return { items: enriched, total, skip: (page - 1) * pageSize, top: pageSize };
  }

  /**
   * Reads a single message's full investigation detail: base `MessageDetails`, categorized headers
   * (currently empty — no `core/providers` contract exposes message-level headers yet, see
   * `MessageDetails`'s own doc comment), attachments, a derived lifecycle timeline, and the context
   * panel composite.
   * @param messageId the MPL message id.
   * @returns the full detail, or `undefined` when unknown.
   */
  public async getById(messageId: string): Promise<MessageDetailDto | undefined> {
    const engine = this.engineFactory();
    const details = await engine.message.getMessage(messageId);
    if (details === undefined) {
      return undefined;
    }
    const [attachments, context] = await Promise.all([
      engine.attachment.listAttachments(messageId),
      this.getContext(messageId, engine),
    ]);
    const headerSummary = engine.header.categorize({
      ...details.sapStandardHeaders,
      ...details.customHeaders,
    });
    return {
      ...details,
      mplId: details.mplId,
      tenantId: MessageMonitoringService.currentTenantId(),
      environment: MessageMonitoringService.currentEnvironmentLabel(),
      retryStatus: MessageMonitoringService.toRetryStatus(details.status, details.customStatus),
      headerSummary,
      attachments,
      timeline: MessageMonitoringService.buildTimeline(details),
      context: context ?? (await this.buildFallbackContext(messageId, details, engine)),
    };
  }

  /**
   * Finds messages related to one message along every supported dimension (§ Related Messages):
   * correlation id, application id, sender, receiver, message type and custom status, each within
   * the same bounded working set the list endpoint operates over. A dimension is omitted when the
   * source message carries no value for it (e.g. `customStatus` on a completed message).
   * @param messageId the source message id.
   * @returns one group per applicable dimension, excluding the source message itself.
   */
  public async getRelated(messageId: string): Promise<readonly RelatedMessageGroupDto[]> {
    const engine = this.engineFactory();
    const source = await engine.message.getMessage(messageId);
    if (source === undefined) {
      throw HttpError.notFound(`No message found with id "${messageId}".`);
    }

    const dimensions: { dimension: RelatedMessageDimension; value: string | undefined }[] = [
      { dimension: "correlationId", value: source.correlationId },
      { dimension: "applicationId", value: source.applicationId },
      { dimension: "sender", value: source.sender },
      { dimension: "receiver", value: source.receiver },
      { dimension: "messageType", value: source.messageType },
      { dimension: "customStatus", value: source.customStatus },
    ];

    const groups: RelatedMessageGroupDto[] = [];
    for (const { dimension, value } of dimensions) {
      if (value === undefined || value === "") {
        continue;
      }
      const matches = await this.findByDimension(engine, dimension, value, source);
      if (matches.length > 0) {
        groups.push({ dimension, value, items: matches });
      }
    }
    return groups;
  }

  /**
   * Composes the Investigation Panel's context data for a message (runtime, best-effort queue
   * reference, certificate watch, recent notifications).
   * @param messageId the message id.
   * @param sharedEngine an already-constructed engine to reuse (avoids a second engine per call from
   *   {@link getById}); a fresh one is built when omitted.
   * @returns the context, or `undefined` when the message is unknown.
   */
  public async getContext(
    messageId: string,
    sharedEngine?: OperationsEngine,
  ): Promise<MessageContextDto | undefined> {
    const engine = sharedEngine ?? this.engineFactory();
    const details = await engine.message.getMessage(messageId);
    if (details === undefined) {
      return undefined;
    }
    return this.buildFallbackContext(messageId, details, engine);
  }

  /**
   * Renders the current working set (after the same filters {@link list} applies, ignoring paging)
   * through the Export Engine (§ Export). PDF is a documented future format, rejected by the engine.
   * @param query the list query (paging ignored — export covers the whole filtered working set).
   * @param format the export format.
   * @returns the rendered export model (content, MIME type, file name).
   */
  public async exportRows(
    query: MessageListQuery,
    format: MessageExportFormat,
  ): Promise<ExportModel> {
    const engine = this.engineFactory();
    const resolved = MessageMonitoringService.applySmartFilter(query);
    const candidates = await this.resolveCandidates(engine, resolved);
    const filtered = MessageMonitoringService.applyLocalFilters(candidates, resolved);
    const sorted = MessageMonitoringService.sort(filtered, resolved);
    const rows = sorted.map((item) => MessageMonitoringService.toRow(item));
    switch (format) {
      case "csv":
        return engine.export.toCsv(rows);
      case "json":
        return engine.export.toJson(rows);
      case "xml":
        return engine.export.toXml(rows);
      case "excel":
        return engine.export.toExcel(rows);
    }
  }

  // --- JMS retry ---------------------------------------------------------------

  /**
   * Cheap, list-toggle-facing classification: does this message's correlation chain show the real
   * JMS bridge flows? One bounded correlation-group fetch — no header reads, no queue lookups (see
   * {@link getRetryCheck} for the expensive, retry-button-facing resolution).
   * @param messageId the MPL message id.
   * @returns the classification.
   */
  public async checkJmsEligibility(messageId: string): Promise<JmsEligibilityDto> {
    const engine = this.engineFactory();
    const source = await engine.message.getMessage(messageId);
    if (source === undefined) {
      throw HttpError.notFound(`No message found with id "${messageId}".`);
    }
    const { eligible, ingress } = await MessageMonitoringService.resolveJmsGroup(engine, source);
    return { messageId, eligible, ingressMessageId: eligible ? ingress?.messageId : undefined };
  }

  /**
   * Full JMS retry resolution: eligibility, the queue parsed from the `IF_JMS_ingress` entry's
   * `CH-Message-Queue` header, and where the message is actually sitting right now (its resolved
   * queue, the central dead-letter queue, or nowhere the tenant can confirm — requiring the operator
   * to pick a queue manually). Bounded to one correlation-group fetch, one header read and up to two
   * keyed queue lookups — expensive relative to {@link checkJmsEligibility}, so only called when the
   * operator actually opens the Retry action for this message.
   * @param messageId the MPL message id.
   * @returns the full resolution.
   */
  public async getRetryCheck(messageId: string): Promise<JmsRetryCheckDto> {
    const engine = this.engineFactory();
    const source = await engine.message.getMessage(messageId);
    if (source === undefined) {
      throw HttpError.notFound(`No message found with id "${messageId}".`);
    }
    const { eligible, ingress } = await MessageMonitoringService.resolveJmsGroup(engine, source);
    if (!eligible || ingress === undefined) {
      return MessageMonitoringService.unresolvedRetryCheck(
        messageId,
        false,
        `This message's correlation chain does not show the JMS bridge flows ("${JMS_INGRESS_IFLOW}"/"${JMS_EGRESS_IFLOW}") — it was not routed through a JMS queue and cannot be retried from one.`,
      );
    }

    const ingressDetail = await engine.message.getMessage(ingress.messageId);
    const resolvedQueue = MessageMonitoringService.resolveQueueFromHeaders(
      ingressDetail?.customHeaders ?? {},
    );
    if (resolvedQueue === undefined) {
      return MessageMonitoringService.unresolvedRetryCheck(
        messageId,
        true,
        `No "${QUEUE_HEADER_NAME}" header was found (or it could not be parsed) on the JMS ingress flow's log entry — pick a queue manually.`,
      );
    }

    const inOriginalQueue = await engine.queue.getMessage(resolvedQueue, messageId);
    if (inOriginalQueue !== undefined) {
      return {
        messageId,
        eligible: true,
        reason: undefined,
        resolvedQueue,
        currentQueue: resolvedQueue,
        resolutionSource: "original-queue",
        retryCount: inOriginalQueue.retryCount,
      };
    }

    const inDlq = await engine.queue.getMessage(CENTRAL_DLQ_QUEUE, messageId);
    if (inDlq !== undefined) {
      return {
        messageId,
        eligible: true,
        reason: undefined,
        resolvedQueue,
        currentQueue: CENTRAL_DLQ_QUEUE,
        resolutionSource: "dead-letter-queue",
        retryCount: inDlq.retryCount,
      };
    }

    return {
      messageId,
      eligible: true,
      reason: `Not found on its resolved queue "${resolvedQueue}" or on the dead-letter queue "${CENTRAL_DLQ_QUEUE}" — pick a queue manually.`,
      resolvedQueue,
      currentQueue: undefined,
      resolutionSource: "unresolved",
      retryCount: undefined,
    };
  }

  /**
   * Executes a real JMS retry against a specific queue (the tenant's `RetryMessagingMessages`
   * action, via {@link module:../../operations/engines/QueueEngine.QueueEngine.retryMessage}) —
   * unlike DLQ & Recovery's honest `executed: false` placeholder, this genuinely runs.
   * @param messageId the message id to retry.
   * @param queueName the queue it currently sits on (resolved automatically, or supplied by the
   *   operator when {@link getRetryCheck} could not resolve one).
   * @param reason optional operator-supplied reason, captured in the audit log.
   * @returns the real retry outcome.
   */
  public async retry(
    messageId: string,
    queueName: string,
    reason?: string,
  ): Promise<JmsRetryResultDto> {
    const engine = this.engineFactory();
    const result = await engine.queue.retryMessage(messageId, queueName, reason);
    return {
      messageId,
      queueName,
      accepted: result.accepted,
      note: result.accepted
        ? `Retry accepted for queue "${queueName}".`
        : `Retry was not accepted for queue "${queueName}".`,
    };
  }

  private static async resolveJmsGroup(
    engine: OperationsEngine,
    source: MessageSummary,
  ): Promise<{ eligible: boolean; ingress: MessageSummary | undefined }> {
    const group = await engine.message.findByCorrelationId(source.correlationId);
    const ingress = group.find((item) =>
      MessageMonitoringService.matchesFlow(item.integrationFlow, JMS_INGRESS_IFLOW),
    );
    const hasEgress = group.some((item) =>
      MessageMonitoringService.matchesFlow(item.integrationFlow, JMS_EGRESS_IFLOW),
    );
    return { eligible: ingress !== undefined && hasEgress, ingress };
  }

  private static matchesFlow(integrationFlow: string, expected: string): boolean {
    return integrationFlow.toLowerCase() === expected.toLowerCase();
  }

  private static resolveQueueFromHeaders(
    headers: Readonly<Record<string, string>>,
  ): string | undefined {
    const entry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === QUEUE_HEADER_NAME.toLowerCase(),
    );
    if (entry === undefined) {
      return undefined;
    }
    const match = QUEUE_HEADER_VALUE_PATTERN.exec(entry[1].trim());
    const captured = match?.[1]?.trim();
    return captured === undefined || captured === "" ? undefined : captured;
  }

  private static unresolvedRetryCheck(
    messageId: string,
    eligible: boolean,
    reason: string,
  ): JmsRetryCheckDto {
    return {
      messageId,
      eligible,
      reason,
      resolvedQueue: undefined,
      currentQueue: undefined,
      resolutionSource: "unresolved",
      retryCount: undefined,
    };
  }

  // --- Candidate resolution --------------------------------------------------

  /**
   * Resolves the pre-pagination candidate set. When `queue` is supplied, the base population is the
   * queue's own parked messages (a genuine `QueueEngine` cross-reference, bounded); otherwise it is
   * the standard `MessageEngine` working set built from every server-filterable criterion.
   */
  private async resolveCandidates(
    engine: OperationsEngine,
    query: MessageListQuery,
  ): Promise<readonly MessageSummary[]> {
    if (query.queue !== undefined) {
      return this.resolveQueueCandidates(engine, query.queue);
    }
    const builder = new OperationsQueryBuilder().page(1).pageSize(WORKING_SET_SIZE);
    if (query.status !== undefined) builder.status(query.status);
    if (query.sender !== undefined) builder.sender(query.sender);
    if (query.receiver !== undefined) builder.receiver(query.receiver);
    if (query.messageType !== undefined) builder.messageType(query.messageType);
    if (query.customStatus !== undefined) builder.customStatus(query.customStatus);
    if (query.applicationId !== undefined) builder.applicationId(query.applicationId);
    if (query.integrationFlow !== undefined) builder.integrationFlow(query.integrationFlow);
    if (query.search !== undefined) builder.search(query.search);
    if (query.dateFrom !== undefined) builder.dateFrom(query.dateFrom);
    if (query.dateTo !== undefined) builder.dateTo(query.dateTo);
    if (query.durationMinMs !== undefined || query.durationMaxMs !== undefined) {
      builder.durationRange(query.durationMinMs, query.durationMaxMs);
    }
    const result = await engine.message.queryMessages(builder.build());
    return result.items;
  }

  private async resolveQueueCandidates(
    engine: OperationsEngine,
    queueName: string,
  ): Promise<readonly MessageSummary[]> {
    const queued = await engine.queue.listMessages(queueName, { skip: 0, top: QUEUE_SCAN_TOP });
    const details = await Promise.all(
      queued.items.map((item) => engine.message.getMessage(item.messageId)),
    );
    return details.filter((item): item is NonNullable<typeof item> => item !== undefined);
  }

  // --- Local (in-memory, bounded) filtering ----------------------------------

  private static applyLocalFilters(
    items: readonly MessageSummary[],
    query: MessageListQuery,
  ): MessageSummary[] {
    return items.filter((item) => {
      if (query.severity !== undefined && item.severity !== query.severity) {
        return false;
      }
      if (query.correlationId !== undefined && item.correlationId !== query.correlationId) {
        return false;
      }
      return true;
    });
  }

  private static applySmartFilter(query: MessageListQuery): MessageListQuery {
    if (query.smartFilter === undefined) {
      return query;
    }
    const now = Date.now();
    switch (query.smartFilter) {
      case "failedToday":
        return {
          ...query,
          status: "FAILED",
          dateFrom: new Date(now - 24 * 3_600_000).toISOString(),
        };
      case "currentlyProcessing":
        return { ...query, status: "PROCESSING" };
      case "longRunning":
        return { ...query, durationMinMs: LONG_RUNNING_THRESHOLD_MS };
      case "retryCandidates":
        return { ...query, status: "RETRY" };
      case "businessErrors":
        return { ...query, status: "ESCALATED" };
      case "systemErrors":
        return { ...query, status: "FAILED" };
      case "recentlyFailed":
        return {
          ...query,
          status: "FAILED",
          dateFrom: new Date(now - 3_600_000).toISOString(),
        };
    }
  }

  private static sort(items: readonly MessageSummary[], query: MessageListQuery): MessageSummary[] {
    if (query.sortBy === undefined) {
      return [...items];
    }
    const field = query.sortBy as keyof MessageSummary;
    const direction = query.sortDirection === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const left = a[field];
      const right = b[field];
      if (left === right) return 0;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return left > right ? direction : -direction;
    });
  }

  // --- Related messages -------------------------------------------------------

  private async findByDimension(
    engine: OperationsEngine,
    dimension: RelatedMessageDimension,
    value: string,
    source: MessageSummary,
  ): Promise<readonly MessageMonitoringDto[]> {
    let matches: readonly MessageSummary[];
    if (dimension === "correlationId") {
      matches = await engine.message.findByCorrelationId(value);
    } else {
      const builder = new OperationsQueryBuilder().page(1).pageSize(WORKING_SET_SIZE);
      if (dimension === "applicationId") builder.applicationId(value);
      if (dimension === "sender") builder.sender(value);
      if (dimension === "receiver") builder.receiver(value);
      if (dimension === "messageType") builder.messageType(value);
      if (dimension === "customStatus") builder.customStatus(value);
      const result = await engine.message.queryMessages(builder.build());
      matches = result.items;
    }
    const others = matches.filter((item) => item.messageId !== source.messageId);
    const enriched = await Promise.all(others.map((item) => this.enrichRow(engine, item)));
    return enriched;
  }

  // --- Context composition -----------------------------------------------------

  private async buildFallbackContext(
    messageId: string,
    details: {
      status: string;
      humanReadableStatus: string;
      severity: Severity;
      integrationFlow: string;
      customStatus: string | undefined;
    },
    engine: OperationsEngine,
  ): Promise<MessageContextDto> {
    const [artifacts, expiringCerts, notifications, queueReference] = await Promise.all([
      engine.runtime.listArtifacts(),
      engine.certificate.listExpiring(CERTIFICATE_WATCH_HORIZON_DAYS),
      engine.notification.listNotifications({ skip: 0, top: CONTEXT_NOTIFICATION_LIMIT }),
      this.findQueueReference(engine, messageId),
    ]);
    const runtime = artifacts.find((artifact) => artifact.name === details.integrationFlow);
    const health = MessageMonitoringService.healthOfSeverity(details.severity);
    return {
      messageId,
      status: details.status,
      humanReadableStatus: details.humanReadableStatus,
      severity: details.severity,
      health,
      summary: MessageMonitoringService.summaryOf(details.status, details.customStatus),
      tenantId: MessageMonitoringService.currentTenantId(),
      environment: MessageMonitoringService.currentEnvironmentLabel(),
      runtime,
      queueReference,
      certificateWatch: expiringCerts,
      recentNotifications: notifications.items,
    };
  }

  private async findQueueReference(
    engine: OperationsEngine,
    messageId: string,
  ): Promise<QueueReferenceDto | undefined> {
    const queues = await engine.queue.listQueues();
    for (const queue of queues) {
      const page = await engine.queue.listMessages(queue.queueName, {
        skip: 0,
        top: QUEUE_SCAN_TOP,
      });
      const match = page.items.find((item) => item.messageId === messageId);
      if (match !== undefined) {
        return {
          queueName: queue.queueName,
          displayName: queue.displayName,
          enqueuedAt: match.enqueuedAt,
          retryCount: match.retryCount,
        };
      }
    }
    return undefined;
  }

  // --- Row enrichment -----------------------------------------------------------

  private async enrichRow(
    engine: OperationsEngine,
    item: MessageSummary,
  ): Promise<MessageMonitoringDto> {
    const attachments = await engine.attachment.listAttachments(item.messageId);
    const knownSizes = attachments
      .map((attachment) => attachment.sizeBytes)
      .filter((size): size is number => size !== undefined);
    return {
      ...item,
      mplId: item.messageId,
      tenantId: MessageMonitoringService.currentTenantId(),
      environment: MessageMonitoringService.currentEnvironmentLabel(),
      retryStatus: MessageMonitoringService.toRetryStatus(item.status, item.customStatus),
      attachmentCount: attachments.length,
      payloadSizeBytes:
        knownSizes.length === 0 ? undefined : knownSizes.reduce((sum, size) => sum + size, 0),
      queueName: undefined,
    };
  }

  private static toRow(item: MessageSummary): Record<string, unknown> {
    return {
      messageId: item.messageId,
      mplId: item.messageId,
      correlationId: item.correlationId,
      integrationFlow: item.integrationFlow,
      status: item.status,
      humanReadableStatus: item.humanReadableStatus,
      severity: item.severity,
      startTime: item.startTime,
      endTime: item.endTime ?? "",
      processingTimeMs: item.processingTimeMs ?? "",
      sender: item.sender,
      receiver: item.receiver,
      applicationId: item.applicationId ?? "",
      messageType: item.messageType ?? "",
      customStatus: item.customStatus ?? "",
    };
  }

  // --- Small pure helpers ---------------------------------------------------

  private static toRetryStatus(status: string, customStatus: string | undefined): RetryStatus {
    const normalized = status.toUpperCase();
    if (customStatus !== undefined || FUNCTIONAL_ERROR_STATUSES.has(normalized)) {
      return "escalated";
    }
    if (TECHNICAL_ERROR_STATUSES.has(normalized)) {
      return "retryable";
    }
    return "not-applicable";
  }

  private static summaryOf(status: string, customStatus: string | undefined): string {
    if (customStatus !== undefined) {
      return `${status} — ${customStatus}`;
    }
    return status;
  }

  private static healthOfSeverity(severity: Severity): "healthy" | "warning" | "critical" {
    if (severity === "critical" || severity === "error") {
      return "critical";
    }
    if (severity === "warning") {
      return "warning";
    }
    return "healthy";
  }

  private static buildTimeline(details: {
    messageId: string;
    startTime: string;
    endTime: string | undefined;
    status: string;
    severity: Severity;
    integrationFlow: string;
    sender: string;
    receiver: string;
  }): readonly MessageTimelineEntryDto[] {
    const entries: MessageTimelineEntryDto[] = [
      {
        id: `${details.messageId}:received`,
        kind: "received",
        title: "Message received",
        description: `From ${details.sender}`,
        severity: "info",
        timestamp: details.startTime,
      },
      {
        id: `${details.messageId}:processingStarted`,
        kind: "processingStarted",
        title: "Processing started",
        description: details.integrationFlow,
        severity: "info",
        timestamp: details.startTime,
      },
      {
        id: `${details.messageId}:routing`,
        kind: "routing",
        title: "Routed",
        description: `${details.sender} → ${details.receiver}`,
        severity: "info",
        timestamp: details.startTime,
      },
    ];
    if (details.endTime !== undefined) {
      const isFailure = details.severity === "error" || details.severity === "critical";
      entries.push({
        id: `${details.messageId}:${isFailure ? "failure" : "completion"}`,
        kind: isFailure ? "failure" : "completion",
        title: isFailure ? "Message failed" : "Message completed",
        description: `To ${details.receiver}`,
        severity: details.severity,
        timestamp: details.endTime,
      });
    }
    return entries;
  }

  private static currentTenantId(): string {
    return configService.getTenant().id;
  }

  private static currentEnvironmentLabel(): string {
    return configService.getEnvironment().label;
  }
}

/** Shared service instance. */
export const messageMonitoringService = new MessageMonitoringService();
