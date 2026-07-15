import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { SearchResult } from "../../operations/dto/index.js";
import type {
  DlqOverviewEntry,
  QueueHealthSummary,
  RecoverRequestBody,
  RecoveryCandidate,
  RecoveryDashboardSummary,
  RecoveryHistoryEntry,
  RecoveryPreview,
  RecoveryResult,
  RecoveryStatistics,
  RecoveryValidationResult,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const DEFAULT_HISTORY_TOP = 50;

/**
 * Aggregation service for the Recovery Center (Phase 11). Builds a fresh, request-scoped
 * {@link OperationsEngine} per call (matching every other Operations-Engine-consuming module) and
 * delegates entirely to `engine.recovery` — this service adds no business logic of its own, only the
 * HTTP-facing seam (deriving `operator` from the caller's identity, defaulting pagination).
 *
 * Recovery History and queue growth-trend samples live in `RecoveryStateStore`'s process-lifetime
 * singleton (see its own doc comment), so they survive across the many short-lived engines this
 * service constructs — cancelling or retrying a recovery recorded by an earlier request works
 * correctly because every engine instance defaults to the *same* underlying store.
 */
export class RecoveryCenterService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  public async getDashboard(): Promise<RecoveryDashboardSummary> {
    return this.engineFactory().recovery.getDashboard();
  }

  public async listCandidates(): Promise<readonly RecoveryCandidate[]> {
    return this.engineFactory().recovery.listCandidates();
  }

  public async getQueueHealth(): Promise<readonly QueueHealthSummary[]> {
    return this.engineFactory().recovery.getQueueHealth();
  }

  public async getDlqOverview(): Promise<readonly DlqOverviewEntry[]> {
    return this.engineFactory().recovery.getDlqOverview();
  }

  public async getStatistics(): Promise<RecoveryStatistics> {
    return this.engineFactory().recovery.getStatistics();
  }

  public async validate(
    sourceQueue: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryValidationResult> {
    return this.engineFactory().recovery.validateRecovery(sourceQueue, callerHasOperatorScope);
  }

  public async preview(
    sourceQueue: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryPreview> {
    return this.engineFactory().recovery.previewRecovery(sourceQueue, callerHasOperatorScope);
  }

  public async recover(
    sourceQueue: string,
    body: RecoverRequestBody,
    operator: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryResult> {
    return this.engineFactory().recovery.executeRecovery(
      {
        sourceQueue,
        messageIds: body.messageIds,
        dryRun: body.dryRun,
        operator,
        reason: body.reason,
      },
      callerHasOperatorScope,
    );
  }

  public cancel(recoveryId: string): RecoveryHistoryEntry | undefined {
    return this.engineFactory().recovery.cancelRecovery(recoveryId);
  }

  public async retry(
    recoveryId: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryResult | undefined> {
    return this.engineFactory().recovery.retryRecovery(recoveryId, callerHasOperatorScope);
  }

  public getHistory(
    skip = 0,
    top: number = DEFAULT_HISTORY_TOP,
  ): SearchResult<RecoveryHistoryEntry> {
    return this.engineFactory().recovery.getHistory({ skip, top });
  }
}

/** Shared service instance. */
export const recoveryCenterService = new RecoveryCenterService();
