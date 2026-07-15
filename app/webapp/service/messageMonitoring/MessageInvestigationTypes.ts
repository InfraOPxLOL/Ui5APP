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
   * Client-only JMS classification cache (§ JMS Retry) — populated lazily by the JMS/Non-JMS toggle
   * via `checkJmsEligibility`, never sent by the backend list response. `undefined` until classified.
   */
  readonly jmsEligible?: boolean;
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
