/**
 * Client-side mirror of the Recovery Center DTOs served by `/api/v1/recovery-center`, itself composed
 * entirely from the Operations Engine's `RecoveryEngine` (architecture: Phase 11). No SDK/CPI/OData
 * shape ever reaches this module — every field here matches `srv/src/operations/dto/RecoveryDto.ts`.
 */

/** Whether a queue is currently in a state recovery can safely act on. */
export type RecoveryReadiness = "ready" | "blocked" | "unknown";

/** One recoverable batch of parked messages — a dead-letter or retry queue with messages on it. */
export interface RecoveryCandidate {
  readonly queueName: string;
  readonly displayName: string;
  readonly sourceQueue: string;
  readonly messageCount: number;
  readonly oldestMessageAgeMs: number | undefined;
  readonly priority: number;
  readonly readiness: RecoveryReadiness;
  readonly blockedReason: string | undefined;
  readonly retryStrategy: string;
  readonly maxRetries: number;
}

/** Growth direction of a queue's message count across recent samples (session-only history). */
export type QueueGrowthTrend = "growing" | "stable" | "shrinking";

/** Consumer attachment state for a queue. */
export type ConsumerStatus = "active" | "inactive";

/** Composite health view of one queue. */
export interface QueueHealthSummary {
  readonly queueName: string;
  readonly displayName: string;
  /** Queue depth — the current message count. */
  readonly messageCount: number;
  readonly healthScore: number;
  readonly growthTrend: QueueGrowthTrend;
  readonly consumerStatus: ConsumerStatus;
  readonly oldestMessageAgeMs: number | undefined;
  readonly newestMessageAgeMs: number | undefined;
  readonly recoveryReadiness: RecoveryReadiness;
}

/** One dead-letter queue's overview entry. */
export interface DlqOverviewEntry {
  readonly dlqName: string;
  readonly sourceQueue: string;
  readonly messageCount: number;
  readonly oldestMessageAgeMs: number | undefined;
}

/** Aggregate recovery statistics derived from session-only recovery history. */
export interface RecoveryStatistics {
  readonly totalRecoveries: number;
  readonly successfulRecoveries: number;
  readonly failedRecoveries: number;
  readonly successRatePct: number;
  readonly averageDurationMs: number;
  readonly messagesRecoveredLast24h: number;
}

/** Lifecycle status of one recovery operation. */
export type RecoveryStatus = "running" | "completed" | "failed" | "cancelled";

/** One entry in Recovery History — session-only, future persistence ready. */
export interface RecoveryHistoryEntry {
  readonly recoveryId: string;
  readonly sourceQueue: string;
  readonly destinationQueue: string;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly durationMs: number | undefined;
  readonly status: RecoveryStatus;
  readonly operator: string;
  readonly dryRun: boolean;
  readonly messagesRequested: number;
  readonly messagesRecovered: number;
  readonly messagesFailed: number;
  readonly result: string;
}

/** One named validation check performed before a recovery is allowed to run. */
export interface RecoveryValidationCheck {
  readonly key:
    | "queueExists"
    | "consumerActive"
    | "runtimeAvailable"
    | "queueMappingExists"
    | "userPermission"
    | "targetQueueReachable";
  readonly passed: boolean;
  readonly message: string;
}

/** The full validation outcome for a prospective recovery. */
export interface RecoveryValidationResult {
  readonly checks: readonly RecoveryValidationCheck[];
  readonly passed: boolean;
}

/** Impact analysis shown alongside a recovery preview. */
export interface RecoveryImpactAnalysis {
  readonly affectedQueue: string;
  readonly messageCount: number;
  readonly estimatedDurationMs: number;
  readonly warnings: readonly string[];
}

/** Everything shown to an operator before they confirm a recovery operation. */
export interface RecoveryPreview {
  readonly sourceQueue: string;
  readonly destinationQueue: string;
  readonly messageCount: number;
  readonly estimatedDurationMs: number;
  readonly validation: RecoveryValidationResult;
  readonly warnings: readonly string[];
  readonly impact: RecoveryImpactAnalysis;
  readonly confirmationRequired: true;
}

/** Request body for `POST /:sourceQueue/recover`. */
export interface RecoverRequestBody {
  readonly messageIds?: readonly string[];
  readonly dryRun?: boolean;
  readonly reason?: string;
}

/** The outcome of a recovery operation. */
export interface RecoveryResult {
  readonly recoveryId: string;
  readonly sourceQueue: string;
  readonly destinationQueue: string;
  readonly status: RecoveryStatus;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly durationMs: number | undefined;
  readonly operator: string;
  readonly dryRun: boolean;
  readonly messagesRequested: number;
  readonly messagesRecovered: number;
  readonly messagesFailed: number;
  readonly result: string;
}

/** The composed view the Recovery Dashboard renders in one call. */
export interface RecoveryDashboardSummary {
  readonly candidates: readonly RecoveryCandidate[];
  readonly queueHealth: readonly QueueHealthSummary[];
  readonly dlqOverview: readonly DlqOverviewEntry[];
  readonly statistics: RecoveryStatistics;
  readonly recentRecoveries: readonly RecoveryHistoryEntry[];
}

/** A page of Recovery History entries. */
export interface RecoveryHistoryPage {
  readonly items: readonly RecoveryHistoryEntry[];
  readonly total: number;
  readonly tookMs: number;
}
