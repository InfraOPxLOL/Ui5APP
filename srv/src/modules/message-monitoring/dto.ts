import type {
  MessageDetails,
  MessageSummary,
  NotificationSummary,
  CertificateSummary,
  RuntimeSummary,
  AttachmentSummary,
  HeaderSummary,
} from "../../operations/dto/index.js";
import type { HealthStatus, Severity } from "../../operations/transform/index.js";

/**
 * Data transfer objects for the Message Monitoring module — now the Message Investigation Workspace
 * (Phase 9). Every shape here is built from the Operations Engine's own DTOs (`operations/dto`);
 * `MessageMonitoringService` never leaks an SDK/CPI/OData shape. Fields the underlying domain model
 * does not carry (payload size, attachment count, queue linkage) are documented seams — populated
 * honestly where real data is available (per-row, bounded), left `undefined` where it is not, never
 * fabricated.
 */

/**
 * One investigation-grade message row. Extends the Operations Engine's {@link MessageSummary}
 * (already enriched with severity/human-readable-status) with:
 * - `mplId` — an explicit alias of `messageId` (the two are the same value in this domain; SAP
 *   Integration Suite's `MessageGuid` *is* the MPL id — see `operations/dto/MessageDto.ts`). Exposed
 *   as its own field only because the investigation table displays "Message ID" and "MPL ID" as
 *   distinct columns, matching Integration Suite Monitoring's own vocabulary.
 * - `tenantId`/`environment` — the tenant/environment every row in a given response belongs to (the
 *   backend is single-tenant-per-request; not a fabricated per-row value, a broadcast one).
 * - `retryStatus` — a UI classification derived from `status`/`customStatus` (not a raw CPI field;
 *   the same kind of derived classification `severityOfStatus()` already performs).
 * - `attachmentCount`/`payloadSizeBytes` — populated only for the page actually returned (bounded,
 *   real `AttachmentEngine` data), never fetched for the full working set. `undefined` before that
 *   enrichment step runs.
 * - `queueName` — populated only when the message is found parked on one of the tenant's enabled
 *   queues (a bounded, best-effort `QueueEngine` lookup, not present for most terminal messages).
 */
export interface MessageMonitoringDto extends MessageSummary {
  readonly mplId: string;
  readonly tenantId: string;
  readonly environment: string;
  readonly retryStatus: RetryStatus;
  readonly attachmentCount: number | undefined;
  readonly payloadSizeBytes: number | undefined;
  readonly queueName: string | undefined;
}

/** UI classification of retry eligibility, derived from `status`/`customStatus` — see {@link MessageMonitoringDto}. */
export type RetryStatus = "retryable" | "escalated" | "not-applicable";

/** Server-paginated page of investigation rows. */
export interface MessageMonitoringPage {
  readonly items: readonly MessageMonitoringDto[];
  readonly total: number;
  readonly skip: number;
  readonly top: number;
}

/** The context panel/detail drawer's timeline entry (§8 of Phase 9 — message lifecycle events). */
export interface MessageTimelineEntryDto {
  readonly id: string;
  readonly kind:
    | "received"
    | "processingStarted"
    | "routing"
    | "receiver"
    | "completion"
    | "failure"
    | "retry"
    | "recovery";
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly timestamp: string;
}

/**
 * Context panel data for a single message (§ Investigation Panel). Composes real Operations Engine
 * data around the message: the runtime artifact its integration flow deploys as, a best-effort queue
 * reference, a tenant-wide certificate watch (no domain field links a message to a specific
 * certificate, so this is honestly a nearby-context glance, not a per-message reference), and recent
 * related notifications.
 */
export interface MessageContextDto {
  readonly messageId: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: Severity;
  readonly health: HealthStatus;
  readonly summary: string;
  readonly tenantId: string;
  readonly environment: string;
  readonly runtime: RuntimeSummary | undefined;
  readonly queueReference: QueueReferenceDto | undefined;
  readonly certificateWatch: readonly CertificateSummary[];
  readonly recentNotifications: readonly NotificationSummary[];
}

/** A best-effort link between a message and the queue it is currently parked on. */
export interface QueueReferenceDto {
  readonly queueName: string;
  readonly displayName: string;
  readonly enqueuedAt: string;
  readonly retryCount: number;
}

/** One relationship dimension for the Related Messages panel (§ Related Messages). */
export type RelatedMessageDimension =
  | "correlationId"
  | "applicationId"
  | "sender"
  | "receiver"
  | "messageType"
  | "customStatus";

/** Messages related along one dimension. */
export interface RelatedMessageGroupDto {
  readonly dimension: RelatedMessageDimension;
  readonly value: string;
  readonly items: readonly MessageMonitoringDto[];
}

/** Full single-message detail (Detail Drawer's Overview/Metadata/Headers/Attachments/Timeline tabs). */
export interface MessageDetailDto extends MessageDetails {
  readonly mplId: string;
  readonly tenantId: string;
  readonly environment: string;
  readonly retryStatus: RetryStatus;
  readonly headerSummary: HeaderSummary;
  readonly attachments: readonly AttachmentSummary[];
  readonly timeline: readonly MessageTimelineEntryDto[];
  readonly context: MessageContextDto;
}

/** Supported bulk-export formats (Export Engine, §Export). PDF is a documented future format. */
export type MessageExportFormat = "csv" | "json" | "xml" | "excel";

/**
 * Cheap, list-toggle-facing JMS classification (§ JMS Retry). Whether a message's correlation chain
 * passed through the real, literal `IF_JMS_ingress`/`IF_JMS_egress` bridge iFlows — the only
 * real signal for "can this message be retried from a JMS queue". Costs one bounded correlation-group
 * fetch; carries no header reads or queue lookups (see {@link JmsRetryCheckDto} for those).
 */
export interface JmsEligibilityDto {
  readonly messageId: string;
  readonly eligible: boolean;
  /** The correlation group's `IF_JMS_ingress` entry's own message id, when found. */
  readonly ingressMessageId: string | undefined;
}

/** Where a JMS-retryable message was actually found sitting, right now. */
export type JmsResolutionSource = "original-queue" | "dead-letter-queue" | "unresolved";

/**
 * Full, retry-button-facing JMS resolution (§ JMS Retry). Resolves the queue a message should be
 * retried from (parsed from the `IF_JMS_ingress` entry's own `CH-Message-Queue` custom header),
 * checks whether the message is actually sitting there (or on the fixed central dead-letter queue)
 * right now, and reports the real current retry count when found. `currentQueue` is `undefined`
 * only when neither location has it — the caller must ask the operator to pick a queue manually.
 */
export interface JmsRetryCheckDto {
  readonly messageId: string;
  readonly eligible: boolean;
  /** Why `eligible` is `false`, or why `currentQueue` could not be resolved. */
  readonly reason: string | undefined;
  readonly resolvedQueue: string | undefined;
  readonly currentQueue: string | undefined;
  readonly resolutionSource: JmsResolutionSource;
  readonly retryCount: number | undefined;
}

/** Outcome of an actually-executed JMS retry (§ JMS Retry) — unlike DLQ & Recovery's honest
 * `executed: false` placeholder, this genuinely calls the tenant's `RetryMessagingMessages` action. */
export interface JmsRetryResultDto {
  readonly messageId: string;
  readonly queueName: string;
  readonly accepted: boolean;
  readonly note: string;
}
