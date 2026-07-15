import type {
  RecoveryDashboardSummary,
  RecoveryCandidate,
  QueueHealthSummary,
  DlqOverviewEntry,
  RecoveryStatistics,
  RecoveryPreview,
  RecoveryValidationResult,
  RecoveryResult,
  RecoveryHistoryEntry,
} from "../../operations/dto/index.js";

/**
 * Data transfer objects for the Recovery Center (Phase 11) — the HTTP contract behind
 * `/api/v1/recovery-center`. Every response shape is the Operations Engine's own Recovery DTO,
 * re-exported verbatim (no SDK/CPI/OData shape ever appears here); `RecoveryCenterService` only adds
 * the HTTP-facing request body below.
 */
export type {
  RecoveryDashboardSummary,
  RecoveryCandidate,
  QueueHealthSummary,
  DlqOverviewEntry,
  RecoveryStatistics,
  RecoveryPreview,
  RecoveryValidationResult,
  RecoveryResult,
  RecoveryHistoryEntry,
};

/**
 * HTTP request body for `POST /:sourceQueue/recover`. `operator` is deliberately absent — it is
 * always derived server-side from the caller's authenticated identity (`req.security`), never
 * trusted from client-supplied JSON, so Recovery History can't be forged.
 */
export interface RecoverRequestBody {
  /** Specific message ids to recover; omitted means "recover all" on the queue. */
  readonly messageIds?: readonly string[];
  readonly dryRun?: boolean;
  readonly reason?: string;
}
