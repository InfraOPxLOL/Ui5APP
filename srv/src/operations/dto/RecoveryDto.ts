/**
 * Business-friendly DTOs for the Recovery Center (architecture: Phase 11, Recovery Engine). Built
 * entirely from `QueueEngine`/`JmsClient`/`RuntimeEngine` plus `config/queues.json`'s existing
 * `deadLetterQueue`/`retryQueue` pairing — no new configuration concept, no SDK/CPI shape ever
 * crosses this boundary.
 */

/** Whether a queue is currently in a state recovery can safely act on. */
export type RecoveryReadiness = "ready" | "blocked" | "unknown";

/** One recoverable batch of parked messages — a dead-letter or retry queue with messages on it. */
export interface RecoveryCandidate {
  /** The physical dead-letter/retry queue the parked messages currently sit on. */
  readonly queueName: string;
  readonly displayName: string;
  /** The original processing queue these messages belong to (`config/queues.json`'s `name`). */
  readonly sourceQueue: string;
  readonly messageCount: number;
  readonly oldestMessageAgeMs: number | undefined;
  /** Ordering weight inherited from the mapped queue's configuration (1 = highest). */
  readonly priority: number;
  readonly readiness: RecoveryReadiness;
  /** Set when `readiness` is `"blocked"`, explaining why recovery is currently disabled. */
  readonly blockedReason: string | undefined;
  /** The mapped queue's configured retry strategy (`config/queues.json`), for the Context Panel. */
  readonly retryStrategy: string;
  /** The mapped queue's configured automatic-retry ceiling (`config/queues.json`). */
  readonly maxRetries: number;
}

/** Growth direction of a queue's message count across recent samples (session-only history). */
export type QueueGrowthTrend = "growing" | "stable" | "shrinking";

/** Consumer attachment state for a queue. */
export type ConsumerStatus = "active" | "inactive";

/** Composite health view of one queue, for the Queue Health and Queue Explorer surfaces. */
export interface QueueHealthSummary {
  readonly queueName: string;
  readonly displayName: string;
  /** Queue depth — the current message count. */
  readonly messageCount: number;
  /** 0–100 composite score (capacity headroom, consumer presence, message age). */
  readonly healthScore: number;
  readonly growthTrend: QueueGrowthTrend;
  readonly consumerStatus: ConsumerStatus;
  readonly oldestMessageAgeMs: number | undefined;
  readonly newestMessageAgeMs: number | undefined;
  readonly recoveryReadiness: RecoveryReadiness;
}

/** One dead-letter queue's overview entry, for the DLQ Overview surface. */
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

/** The full validation outcome for a prospective recovery. Recovery is disabled unless `passed`. */
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
  /** Always `true` — every recovery operation requires explicit confirmation, no exceptions. */
  readonly confirmationRequired: true;
}

/** A request to recover messages parked on a dead-letter/retry queue. */
export interface RecoveryRequest {
  /** The dead-letter/retry queue to recover messages from. */
  readonly sourceQueue: string;
  /** Specific message ids to recover; omitted/undefined means "recover all" on the queue. */
  readonly messageIds?: readonly string[];
  /** Simulates the operation (validation + preview only) without retrying any message. */
  readonly dryRun?: boolean;
  /** The operator performing the recovery, captured for Recovery History. */
  readonly operator: string;
  /** Optional operator-supplied reason, captured in Recovery History. */
  readonly reason?: string;
}

/** The outcome of a recovery operation (also appended to Recovery History). */
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
