/**
 * Client-side mirror of the backend Operations module DTOs (`/api/v1/operations`), which the backend
 * composes entirely from the Operations Engine (Phase 6). These are the **only** shapes the
 * Operations Workspace consumes — no SDK, OData or CPI shape ever reaches the UI (architecture:
 * UI → Operations Engine → SDK → Integration Suite).
 */

/** Health level, identical to the Operations Engine's `HealthStatus`. */
export type HealthStatus = "healthy" | "warning" | "critical";

/** Severity level, identical to the Operations Engine's `Severity`. */
export type OpsSeverity = "info" | "warning" | "error" | "critical";

/** A reusable operations health widget (§3). */
export interface HealthWidget {
  readonly id: string;
  readonly titleKey: string;
  readonly health: HealthStatus;
  readonly statusText: string;
  readonly severity: OpsSeverity;
  readonly value: number;
  readonly total: number;
  readonly description: string;
  readonly recommendedAction: string;
}

/** A reusable interface (integration-flow) summary card (§9). */
export interface InterfaceSummary {
  readonly name: string;
  readonly statusText: string;
  readonly health: HealthStatus;
  readonly lastExecution: string | undefined;
  readonly averageRuntimeMs: number | undefined;
  readonly averageRuntimeHuman: string;
  readonly messageCount: number;
  readonly failures: number;
  readonly warnings: number;
}

/** The kind of a timeline event (§8). */
export type TimelineEventKind =
  | "failure"
  | "recovery"
  | "deployment"
  | "alert"
  | "runtime"
  | "queue"
  | "certificate";

/** One entry on the operations timeline (§8). */
export interface TimelineEvent {
  readonly id: string;
  readonly kind: TimelineEventKind;
  readonly title: string;
  readonly description: string;
  readonly severity: OpsSeverity;
  readonly timestamp: string;
  readonly source: string;
}

/** A compact quick-insight chip (§2). */
export interface QuickInsight {
  readonly id: string;
  readonly labelKey: string;
  readonly value: string;
  readonly severity: OpsSeverity;
  readonly hint: string;
}

/** One "top N by count" ranking entry. */
export interface RankedEntry {
  readonly key: string;
  readonly count: number;
}

/** One raw-value → count breakdown entry. */
export interface ValueCount {
  readonly value: string;
  readonly count: number;
}

/** Aggregated KPIs over the live window. */
export interface StatisticsSummary {
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly totalMessages: number;
  readonly failedCount: number;
  readonly completedCount: number;
  readonly processingCount: number;
  readonly cancelledCount: number;
  readonly averageProcessingTimeMs: number | undefined;
  readonly maxProcessingTimeMs: number | undefined;
  readonly minProcessingTimeMs: number | undefined;
  readonly topSenders: readonly RankedEntry[];
  readonly topReceivers: readonly RankedEntry[];
  readonly topApplications: readonly RankedEntry[];
  readonly topMessageTypes: readonly RankedEntry[];
  readonly statusDistribution: readonly ValueCount[];
  readonly runtimeStatusDistribution: readonly ValueCount[];
}

/** The business-friendly view of one message processing log. */
export interface MessageSummary {
  readonly messageId: string;
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
}

/** The business-friendly view of one notification/alert. */
export interface NotificationSummary {
  readonly notificationId: string;
  readonly severity: OpsSeverity;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly raisedAt: string;
  readonly tags: readonly string[];
}

/** The business-friendly view of one JMS queue. */
export interface QueueSummary {
  readonly queueName: string;
  readonly displayName: string;
  readonly description: string;
  readonly state: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly capacityUsedPct: number;
  readonly utilization: number;
  readonly health: HealthStatus;
  readonly deadLetterQueue: string;
  readonly retryQueue: string;
  readonly priority: number;
  readonly retryStrategy: string;
  readonly maxRetries: number;
}

/** The business-friendly view of one keystore entry. */
export interface CertificateSummary {
  readonly alias: string;
  readonly keyType: string;
  readonly owner: string | undefined;
  readonly issuer: string | undefined;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string | undefined;
  readonly daysRemaining: number;
  readonly health: HealthStatus;
}

/** The business-friendly view of one deployed runtime artifact. */
export interface RuntimeSummary {
  readonly artifactId: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly health: HealthStatus;
  readonly deployedOn: string | undefined;
  readonly deployedBy: string | undefined;
  readonly errorText: string | undefined;
}

/** The statistics window the overview was computed over. */
export interface OperationsWindow {
  readonly from: string;
  readonly to: string;
  readonly hours: number;
}

/** The single aggregated Operations Overview payload (§2). */
export interface OperationsOverview {
  readonly generatedAt: string;
  readonly window: OperationsWindow;
  readonly health: readonly HealthWidget[];
  readonly statistics: StatisticsSummary;
  readonly runtimeHealthCounts: Readonly<Record<HealthStatus, number>>;
  readonly topInterfaces: readonly InterfaceSummary[];
  readonly recentFailures: readonly MessageSummary[];
  readonly recentNotifications: readonly NotificationSummary[];
  readonly timeline: readonly TimelineEvent[];
  readonly quickInsights: readonly QuickInsight[];
}

/** The aggregated workspace search response (§6). */
export interface OperationsSearchResponse {
  readonly query: string;
  readonly messages: readonly MessageSummary[];
  readonly queues: readonly QueueSummary[];
  readonly certificates: readonly CertificateSummary[];
  readonly runtimeArtifacts: readonly RuntimeSummary[];
  readonly totalHits: number;
  readonly tookMs: number;
}
