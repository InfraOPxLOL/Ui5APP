import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  DlqOverviewEntry,
  QueueHealthSummary,
  RecoveryCandidate,
  RecoveryDashboardSummary,
  RecoveryHistoryEntry,
  RecoveryPreview,
  RecoveryResult,
  RecoveryStatistics,
} from "../../service/recoveryCenter/RecoveryCenterTypes";
import type { SavedExplorerLayout } from "../../service/recoveryCenter/RecoveryLayoutService";

/** The Recovery Center's internal section tabs. */
export type RecoveryTabKey = "dashboard" | "explorer" | "candidates" | "queueHealth" | "history";

/** State for the Recovery Preview / confirmation dialog (§ Recovery Preview, § Recovery Validation). */
export interface PreviewState {
  open: boolean;
  busy: boolean;
  /** The candidate queue names being previewed/recovered (more than one for a bulk "Recover Selected"). */
  queueNames: string[];
  previews: RecoveryPreview[];
  totalMessageCount: number;
  totalEstimatedDurationMs: number;
  allPassed: boolean;
  dryRun: boolean;
  confirming: boolean;
  results: RecoveryResult[];
}

/** State for the queue Context Panel (§ Context Panel). */
export interface ContextPanelState {
  open: boolean;
  candidate: RecoveryCandidate | null;
  queue: QueueHealthSummary | null;
}

/** The single view model for the Recovery Center (Phase 11). */
export interface RecoveryCenterState {
  busy: boolean;
  activeTab: RecoveryTabKey;
  dashboard: RecoveryDashboardSummary | null;
  candidates: readonly RecoveryCandidate[];
  selectedCandidateQueues: string[];
  candidateSmartFilter: "all" | "ready" | "blocked";
  candidateGroupBySource: boolean;
  queueHealth: readonly QueueHealthSummary[];
  dlqOverview: readonly DlqOverviewEntry[];
  statistics: RecoveryStatistics | null;
  history: { items: readonly RecoveryHistoryEntry[]; total: number };
  historySkip: number;
  historyTop: number;
  explorerSearch: string;
  explorerSort: { field: string; descending: boolean };
  savedLayouts: readonly SavedExplorerLayout[];
  saveLayoutDialogOpen: boolean;
  layoutNameDraft: string;
  contextPanel: ContextPanelState;
  preview: PreviewState;
  error: string;
}

function initialPreview(): PreviewState {
  return {
    open: false,
    busy: false,
    queueNames: [],
    previews: [],
    totalMessageCount: 0,
    totalEstimatedDurationMs: 0,
    allPassed: false,
    dryRun: false,
    confirming: false,
    results: [],
  };
}

/**
 * The Recovery Center view model, owned by the module component under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.recoveryCenter
 */
export default class RecoveryCenterModel extends JSONModel {
  public constructor() {
    const initial: RecoveryCenterState = {
      busy: false,
      activeTab: "dashboard",
      dashboard: null,
      candidates: [],
      selectedCandidateQueues: [],
      candidateSmartFilter: "all",
      candidateGroupBySource: false,
      queueHealth: [],
      dlqOverview: [],
      statistics: null,
      history: { items: [], total: 0 },
      historySkip: 0,
      historyTop: 20,
      explorerSearch: "",
      explorerSort: { field: "queueName", descending: false },
      savedLayouts: [],
      saveLayoutDialogOpen: false,
      layoutNameDraft: "",
      contextPanel: { open: false, candidate: null, queue: null },
      preview: initialPreview(),
      error: "",
    };
    super(initial);
  }
}

export { initialPreview };
