/**
 * Client-side mirror of the backend Message Investigation Workspace DTOs
 * (`/api/v1/message-monitoring`, itself composed entirely from the Operations Engine). These are the
 * only shapes the workspace consumes — no SDK, OData or CPI shape ever reaches the UI (architecture:
 * UI → Operations Engine → SDK → Integration Suite).
 */

/** Health level, identical to the Operations Engine's `HealthStatus`. */
export type HealthStatus = "healthy" | "warning" | "critical";

/** Severity level, identical to the Operations Engine's `Severity`. */
export type OpsSeverity = "info" | "warning" | "error" | "critical";

/** UI classification of retry eligibility, derived server-side from `status`/`customStatus`. */
export type RetryStatus = "retryable" | "escalated" | "not-applicable";

/**
 * Which processing framework a message belongs to — an **identity**, mirroring the backend's
 * `ProcessingFramework`.
 *
 * Deliberately independent of {@link RecoveryState}: framework answers "what owns this message?",
 * recovery state answers "what condition is it in?". The two are separate columns and separate
 * filters, and are never combined into one value.
 */
export type ProcessingFramework =
  | "TPM_V2"
  | "JMS_FRAMEWORK"
  | "COMMON_IDOC_ROUTER"
  | "IDOC_STATUS_SYNC"
  | "NON_FRAMEWORK"
  | "UNKNOWN";

/** How strong the evidence behind a framework classification is. */
export type DetectionConfidence = "confirmed" | "probable" | "none";

/** What role the queue a message was found on plays in its framework's topology. */
export type QueueRole = "MAIN" | "DLQ" | "NONE" | "UNKNOWN";

/** The operational recovery condition of a message — the axis independent of framework. */
export type RecoveryState =
  | "RECOVERABLE"
  | "RETRY_AVAILABLE"
  | "DLQ_RECOVERY_AVAILABLE"
  | "RETRYING"
  | "NOT_FOUND"
  | "MANUAL_INVESTIGATION_REQUIRED"
  | "UNSUPPORTED"
  | "COMPLETED"
  | "FAILED_AGAIN";

/** The recovery action a strategy resolved for one message. */
export type RecoveryAction = "RETRY_IN_PLACE" | "MOVE_THEN_RETRY" | "MANUAL" | "NONE";

/** One rule evaluation recorded during detection — the negative entries explain an `UNKNOWN`. */
export interface DetectionEvidence {
  readonly rule: string;
  readonly matched: boolean;
  readonly outcome: string;
}

/** One step of a recovery path, rendered as `Processing DLQ → MOVE → SAP_TPM_INBOUND_Q → RETRY`. */
export interface RecoveryPathStep {
  readonly action: "LOCATED" | "MOVE" | "VERIFY" | "RETRY" | "MANUAL";
  readonly queueName: string | undefined;
  readonly description: string;
}

/** Full framework detection for one message, including the evidence behind the verdict. */
export interface FrameworkDetection {
  readonly framework: ProcessingFramework;
  readonly confidence: DetectionConfidence;
  readonly matchedRule: string | undefined;
  readonly detectedQueue: string | undefined;
  readonly queueRole: QueueRole;
  readonly sourceMplId: string;
  readonly correlationId: string;
  readonly evidence: readonly DetectionEvidence[];
  readonly possibleRecoveryPath: readonly RecoveryPathStep[] | undefined;
}

/** One validation requirement a strategy checked before allowing execution. */
export interface RecoveryValidation {
  readonly key: string;
  readonly passed: boolean;
  readonly message: string;
}

/** A single message's resolved recovery plan (the Recovery tab, and each Recovery Plan dialog row). */
export interface MessageRecoveryPlan {
  readonly messageId: string;
  readonly framework: ProcessingFramework;
  readonly detection: FrameworkDetection;
  readonly supported: boolean;
  readonly executable: boolean;
  readonly recoveryState: RecoveryState;
  readonly action: RecoveryAction;
  readonly currentLocation: string | undefined;
  readonly currentQueue: string | undefined;
  readonly queueRole: QueueRole;
  readonly targetQueue: string | undefined;
  readonly moveRequired: boolean;
  readonly validations: readonly RecoveryValidation[];
  readonly path: readonly RecoveryPathStep[];
  readonly explanation: string;
}

/** The outcome classification every recovery operation resolves to. */
export type RecoveryOutcomeStatus =
  | "accepted"
  | "successful"
  | "already-processed"
  | "failed"
  | "unavailable";

/** One executed step of a recovery, with its real upstream outcome. */
export interface RecoveryStepResult {
  readonly action: RecoveryPathStep["action"];
  readonly queueName: string | undefined;
  readonly succeeded: boolean;
  readonly detail: string;
}

/**
 * The real outcome of an executed recovery. `accepted` means the tenant took the retry — **not** that
 * the message processed successfully, which is only observable later in its processing log. The UI
 * must never upgrade this to "succeeded" on its own.
 */
export interface MessageRecoveryOutcome {
  readonly messageId: string;
  readonly framework: ProcessingFramework;
  readonly status: RecoveryOutcomeStatus;
  readonly recoveryState: RecoveryState;
  readonly steps: readonly RecoveryStepResult[];
  readonly note: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

/** The bulk recovery plan behind "Retry Selected" — every selected message, plus what will run. */
export interface RecoveryPlanBatch {
  readonly plans: readonly MessageRecoveryPlan[];
  readonly executableMessageIds: readonly string[];
  readonly executableCount: number;
  readonly excludedCount: number;
}

/** One investigation-grade message row (see the backend `MessageMonitoringDto` doc comment). */
export interface MessageMonitoringItem {
  readonly messageId: string;
  readonly mplId: string;
  readonly correlationId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: OpsSeverity;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly processingTimeMs: number | undefined;
  readonly processingTimeHuman: string;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId: string | undefined;
  readonly messageType: string | undefined;
  readonly customStatus: string | undefined;
  readonly tenantId: string;
  readonly environment: string;
  readonly retryStatus: RetryStatus;
  readonly attachmentCount: number | undefined;
  readonly payloadSizeBytes: number | undefined;
  readonly queueName: string | undefined;
  /**
   * Which processing framework owns this message — resolved **server-side** (never guessed here) by
   * cheap detection at list scope. Frameworks detectable only through queue topology legitimately
   * arrive as `UNKNOWN` and resolve when the row is selected.
   */
  readonly framework: ProcessingFramework;
  /** How strong the evidence behind `framework` is; `probable` means a name-shape match only. */
  readonly frameworkConfidence: DetectionConfidence;
  /**
   * The message's recovery condition — the second, independent axis. Indicative at list scope (no
   * queue was probed); the authoritative value comes from the recovery plan.
   */
  readonly recoveryState: RecoveryState;
}

/** Server-paginated page of investigation rows. */
export interface MessageMonitoringPage {
  readonly items: readonly MessageMonitoringItem[];
  readonly total: number;
  readonly skip: number;
  readonly top: number;
}

/** One header/property entry, categorized as SAP-standard or custom. */
export interface HeaderEntry {
  readonly name: string;
  readonly value: string;
  readonly category: "sap-standard" | "custom";
}

/** Categorized headers/properties for a message. */
export interface HeaderSummary {
  readonly all: readonly HeaderEntry[];
  readonly sapStandard: readonly HeaderEntry[];
  readonly custom: readonly HeaderEntry[];
}

/** One attachment's metadata (no content — payload rendering is a future workspace). */
export interface AttachmentSummary {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}

/** One entry on the message's derived lifecycle timeline. */
export interface MessageTimelineEntry {
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
  readonly severity: OpsSeverity;
  readonly timestamp: string;
}

/** A best-effort link between a message and the queue it is currently parked on. */
export interface QueueReference {
  readonly queueName: string;
  readonly displayName: string;
  readonly enqueuedAt: string;
  readonly retryCount: number;
}

/** A single expiring/expired certificate the certificate watch surfaces. */
export interface CertificateWatchEntry {
  readonly alias: string;
  readonly owner: string | undefined;
  readonly validTo: string;
  readonly daysRemaining: number;
  readonly health: HealthStatus;
}

/** A recent notification related to the message's operational surroundings. */
export interface RelatedNotification {
  readonly notificationId: string;
  readonly severity: OpsSeverity;
  readonly title: string;
  readonly description: string;
  readonly raisedAt: string;
}

/** The runtime artifact a message's integration flow deploys as. */
export interface RuntimeReference {
  readonly artifactId: string;
  readonly name: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly health: HealthStatus;
}

/** Investigation panel / context data for a single message. */
export interface MessageContext {
  readonly messageId: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: OpsSeverity;
  readonly health: HealthStatus;
  readonly summary: string;
  readonly tenantId: string;
  readonly environment: string;
  readonly runtime: RuntimeReference | undefined;
  readonly queueReference: QueueReference | undefined;
  readonly certificateWatch: readonly CertificateWatchEntry[];
  readonly recentNotifications: readonly RelatedNotification[];
}

/** One relationship dimension for the Related Messages panel. */
export type RelatedMessageDimension =
  | "correlationId"
  | "applicationId"
  | "sender"
  | "receiver"
  | "messageType"
  | "customStatus";

/** Messages related to a source message along one dimension. */
export interface RelatedMessageGroup {
  readonly dimension: RelatedMessageDimension;
  readonly value: string;
  readonly items: readonly MessageMonitoringItem[];
}

/** Full single-message detail (Detail Drawer content). */
export interface MessageDetail extends MessageMonitoringItem {
  readonly errorDetails: readonly {
    readonly text: string;
    readonly category: string | undefined;
  }[];
  readonly sapStandardHeaders: Readonly<Record<string, string>>;
  readonly customHeaders: Readonly<Record<string, string>>;
  readonly headerSummary: HeaderSummary;
  readonly attachments: readonly AttachmentSummary[];
  readonly timeline: readonly MessageTimelineEntry[];
  readonly context: MessageContext;
}

/** Recognized smart-filter presets (§ Smart Filters). */
export type SmartFilter =
  | "failedToday"
  | "currentlyProcessing"
  | "longRunning"
  | "retryCandidates"
  | "businessErrors"
  | "systemErrors"
  | "recentlyFailed";

/** Advanced Search Panel criteria — mirrors the backend's list-query contract field-for-field. */
export interface MessageSearchCriteria {
  status?: string;
  severity?: OpsSeverity;
  sender?: string;
  receiver?: string;
  messageType?: string;
  customStatus?: string;
  applicationId?: string;
  integrationFlow?: string;
  correlationId?: string;
  queue?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  durationMinMs?: number;
  durationMaxMs?: number;
  smartFilter?: SmartFilter;
  /** Processing-framework filter — replaces the old binary JMS/Non-JMS toggle. Server-side. */
  framework?: ProcessingFramework;
  /** Recovery-condition filter, the second independent axis. Server-side. */
  recoveryState?: RecoveryState;
  /** Client-side-only post-filter over the loaded page (not sent to the backend). */
  hasAttachments?: boolean;
  /** Client-side-only post-filter over the loaded page (not sent to the backend). */
  hasPayload?: boolean;
}

/** Supported bulk-export formats (Export Engine). PDF is a documented future format. */
export type MessageExportFormat = "csv" | "json" | "xml" | "excel";

/** Cheap, list-toggle-facing JMS classification (§ JMS Retry). */
export interface JmsEligibility {
  readonly messageId: string;
  readonly eligible: boolean;
  readonly ingressMessageId: string | undefined;
}

/** Where a JMS-retryable message was actually found sitting, right now. */
export type JmsResolutionSource = "original-queue" | "dead-letter-queue" | "unresolved";

/** Full, retry-button-facing JMS resolution (§ JMS Retry). */
export interface JmsRetryCheck {
  readonly messageId: string;
  readonly eligible: boolean;
  readonly reason: string | undefined;
  readonly resolvedQueue: string | undefined;
  readonly currentQueue: string | undefined;
  readonly resolutionSource: JmsResolutionSource;
  readonly retryCount: number | undefined;
}

/** Outcome of an actually-executed JMS retry (§ JMS Retry). */
export interface JmsRetryResult {
  readonly messageId: string;
  readonly queueName: string;
  readonly accepted: boolean;
  readonly note: string;
}
