import BaseService from "../../core/base/BaseService";
import type {
  DlqOverviewEntry,
  QueueHealthSummary,
  RecoverRequestBody,
  RecoveryCandidate,
  RecoveryDashboardSummary,
  RecoveryHistoryEntry,
  RecoveryHistoryPage,
  RecoveryPreview,
  RecoveryResult,
  RecoveryStatistics,
  RecoveryValidationResult,
} from "./RecoveryCenterTypes";

/**
 * Data service for the Recovery Center. Consumes **only** `/api/v1/recovery-center`, which the
 * backend composes entirely from the Operations Engine — the workspace never talks to the SDK, never
 * knows a JMS endpoint, and only ever handles Recovery Center DTOs (architecture: UI → Operations
 * Engine → SDK → Integration Suite).
 */
export default class RecoveryCenterService extends BaseService {
  public constructor() {
    super("/api/v1/recovery-center");
  }

  /** Loads the composed Recovery Dashboard. */
  public async getDashboard(signal?: AbortSignal): Promise<RecoveryDashboardSummary> {
    return this.client.get<RecoveryDashboardSummary>(this.path("dashboard"), { signal });
  }

  /** Lists recovery candidates (dead-letter/retry queues holding parked messages). */
  public async listCandidates(signal?: AbortSignal): Promise<readonly RecoveryCandidate[]> {
    return this.client.get<readonly RecoveryCandidate[]>(this.path("candidates"), { signal });
  }

  /** Loads the composite health view of every configured processing queue. */
  public async getQueueHealth(signal?: AbortSignal): Promise<readonly QueueHealthSummary[]> {
    return this.client.get<readonly QueueHealthSummary[]>(this.path("queue-health"), { signal });
  }

  /** Loads one overview entry per configured dead-letter queue. */
  public async getDlqOverview(signal?: AbortSignal): Promise<readonly DlqOverviewEntry[]> {
    return this.client.get<readonly DlqOverviewEntry[]>(this.path("dlq-overview"), { signal });
  }

  /** Loads aggregate recovery statistics. */
  public async getStatistics(signal?: AbortSignal): Promise<RecoveryStatistics> {
    return this.client.get<RecoveryStatistics>(this.path("statistics"), { signal });
  }

  /** Runs every recovery validation check for a prospective recovery. */
  public async validate(
    sourceQueue: string,
    signal?: AbortSignal,
  ): Promise<RecoveryValidationResult> {
    return this.client.get<RecoveryValidationResult>(
      this.path(`${encodeURIComponent(sourceQueue)}/validate`),
      { signal },
    );
  }

  /** Loads the full preview (validation + impact analysis) shown before a recovery is confirmed. */
  public async preview(sourceQueue: string, signal?: AbortSignal): Promise<RecoveryPreview> {
    return this.client.get<RecoveryPreview>(
      this.path(`${encodeURIComponent(sourceQueue)}/preview`),
      {
        signal,
      },
    );
  }

  /** Executes (or dry-run simulates) a recovery. */
  public async recover(sourceQueue: string, body: RecoverRequestBody): Promise<RecoveryResult> {
    return this.client.post<RecoveryResult, RecoverRequestBody>(
      this.path(`${encodeURIComponent(sourceQueue)}/recover`),
      body,
    );
  }

  /** Cancels a recorded-but-not-yet-finalized recovery. */
  public async cancel(recoveryId: string): Promise<RecoveryHistoryEntry> {
    return this.client.post<RecoveryHistoryEntry>(
      this.path(`${encodeURIComponent(recoveryId)}/cancel`),
    );
  }

  /** Retries a previously failed or cancelled recovery. */
  public async retry(recoveryId: string): Promise<RecoveryResult> {
    return this.client.post<RecoveryResult>(this.path(`${encodeURIComponent(recoveryId)}/retry`));
  }

  /** Lists Recovery History, most recent first. */
  public async getHistory(
    skip: number,
    top: number,
    signal?: AbortSignal,
  ): Promise<RecoveryHistoryPage> {
    return this.client.get<RecoveryHistoryPage>(this.path("history"), {
      query: { skip, top },
      signal,
    });
  }
}
