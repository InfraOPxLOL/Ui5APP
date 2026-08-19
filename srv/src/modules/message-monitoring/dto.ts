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
import type {
  DetectionConfidence,
  FrameworkDetection,
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  ProcessingFramework,
  RecoveryPlanBatch,
  RecoveryState,
} from "../../operations/dto/index.js";

export type {
  DetectionConfidence,
  DetectionEvidence,
  FrameworkDetection,
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  ProcessingFramework,
  QueueRole,
  RecoveryAction,
  RecoveryOutcomeStatus,
  RecoveryPathStep,
  RecoveryPlanBatch,
  RecoveryState,
  RecoveryStepResult,
  RecoveryValidation,
} from "../../operations/dto/index.js";

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
 * - `framework`/`frameworkConfidence`/`recoveryState` — the Phase 13 framework-awareness fields, see
 *   their own doc comments below.
 */
export interface MessageMonitoringDto extends MessageSummary {
  readonly mplId: string;
  readonly tenantId: string;
  readonly environment: string;
  readonly retryStatus: RetryStatus;
  readonly attachmentCount: number | undefined;
  readonly payloadSizeBytes: number | undefined;
  readonly queueName: string | undefined;
  /**
   * Which processing framework owns this message (§1) — an **identity**, entirely independent of
   * the message's condition. Resolved by *cheap* detection at list scope: integration-flow patterns
   * plus correlation-group flow names, both evaluated over the working set already in memory, so the
   * column costs no extra upstream calls per row.
   *
   * Frameworks whose only configured signal is their queue topology cannot be resolved this cheaply
   * and legitimately appear as `UNKNOWN` here; selecting the row runs *full* detection, which adds
   * header and queue evidence. The value is never a guess — see `frameworkConfidence`.
   */
  readonly framework: ProcessingFramework;
  /** How strong the evidence behind `framework` is. `probable` means a name-shape match only. */
  readonly frameworkConfidence: DetectionConfidence;
  /**
   * The message's recovery **condition** (§7) — the second, independent axis. A failed TPM V2
   * message is `framework: "TPM_V2"` *and* `recoveryState: "…"`; the two are never fused.
   *
   * At list scope this is the *indicative* value derived from MPL status plus the detected framework,
   * with **no queue probing** — the grid's recoverability indicator, not a promise. The authoritative
   * value, which has really located the message, comes from the recovery-plan endpoint.
   */
  readonly recoveryState: RecoveryState;
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

// --- Framework awareness & recovery (Phase 13) ---------------------------------

/**
 * Full framework detection for one selected message — everything cheap list-scope detection could
 * not resolve, plus the evidence trail.
 *
 * Unlike the list's `framework` field this runs header rules and really probes the framework's
 * queues, so `detectedQueue`/`queueRole` are populated when the message is actually sitting
 * somewhere. Reported as `UNKNOWN` **with evidence** when nothing matches — never guessed.
 */
export type MessageFrameworkDto = FrameworkDetection;

/**
 * A single message's resolved recovery plan (§8's detail panel): framework, current location and
 * queue, the action, whether a move is required, the validations, and the human-readable path the UI
 * renders as `Processing DLQ → MOVE → SAP_TPM_INBOUND_Q → RETRY`.
 *
 * Read-only — resolving a plan never moves, retries or mutates anything.
 */
export type MessageRecoveryPlanDto = MessageRecoveryPlan;

/**
 * The bulk recovery plan behind "Retry Selected" (§9). Carries a plan for **every** selected message
 * so the confirmation dialog can show non-executable ones (and why they are excluded) alongside the
 * ones that will actually run — `executableMessageIds` is the set that gets executed.
 */
export type RecoveryPlanBatchDto = RecoveryPlanBatch;

/**
 * The real outcome of an executed recovery, step by step. A move accepted by the tenant but whose
 * verification could not find the message on the target queue reports exactly that and stops, rather
 * than proceeding to retry — the UI never infers success from an accepted request (§7, §10).
 */
export type MessageRecoveryOutcomeDto = MessageRecoveryOutcome;
