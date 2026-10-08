import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  MessageContext,
  MessageDetail,
  MessageMonitoringItem,
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  MessageSearchCriteria,
  RelatedMessageGroup,
  SmartFilter,
} from "../../service/messageMonitoring/MessageInvestigationTypes";
import type { RecoveryPlanRow } from "../../controller/messageMonitoring/RecoveryPathFormatter";
import type { SavedSearch } from "../../service/messageMonitoring/SavedSearchService";
import type { SavedLayout } from "../../service/messageMonitoring/GridLayoutService";
import type { SmartFilterDefinition } from "../../config/messageMonitoring/smartFilters";

/** Live-refresh / busy state for the grid. */
export interface GridState {
  busy: boolean;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
  groupByProperty: string;
  density: "compact" | "cozy";
}

/** Detail Drawer state. */
export interface DrawerState {
  expanded: boolean;
  activeTab: string;
  busy: boolean;
  detail: MessageDetail | null;
}

/** Context Panel state. */
export interface ContextPanelState {
  busy: boolean;
  context: MessageContext | null;
  related: readonly RelatedMessageGroup[];
}

/** A smart filter enriched with its resolved display title (view-model shape). */
export interface SmartFilterVM extends SmartFilterDefinition {
  readonly title: string;
}

/**
 * Framework-aware recovery view-model for the selected message (Phase 13, §8). Replaces the old
 * JMS-only `JmsRetryVM`: the queue and path now come from whichever strategy owns the message, not
 * from an assumption that every retryable message went through the JMS bridge.
 */
export interface RecoveryVM {
  busy: boolean;
  /** Whether a plan has been loaded for the current selection yet. */
  loaded: boolean;
  plan: MessageRecoveryPlan | null;
  /** The multi-line `DLQ → MOVE → Queue → RETRY` block rendered in the Recovery tab. */
  pathBlock: string;
  /** The last executed outcome, so the tab can show what actually happened. */
  outcome: MessageRecoveryOutcome | null;
}

/** Bulk Recovery Plan dialog state (§9). */
export interface RecoveryPlanVM {
  busy: boolean;
  rows: readonly RecoveryPlanRow[];
  executableMessageIds: readonly string[];
  executableCount: number;
  excludedCount: number;
  /** Populated once execution finishes, one entry per executed message. */
  results: readonly MessageRecoveryOutcome[];
  summary: string;
  /** True while the dialog is showing results rather than the pre-execution plan. */
  executed: boolean;
}

/** Shape of the Message Investigation Workspace view model. */
export interface MessageMonitoringState {
  items: MessageMonitoringItem[];
  total: number;
  grid: GridState;
  criteria: MessageSearchCriteria;
  activeSmartFilter: SmartFilter | "";
  smartFilters: SmartFilterVM[];
  selectedMessageId: string;
  selectedMessageIds: string[];
  bookmarkedIds: string[];
  savedSearches: SavedSearch[];
  /** Key of the saved search chosen in the compact saved-search `Select` ("" = none). */
  selectedSavedSearchId: string;
  savedLayouts: SavedLayout[];
  actions: { id: string; title: string; icon: string }[];
  newSavedSearchName: string;
  newLayoutName: string;
  advancedSearchOpen: boolean;
  /** Whether the Advanced Search Panel's secondary "More Parameters" section is expanded. */
  moreParametersOpen: boolean;
  contextCollapsed: boolean;
  detailPageOpen: boolean;
  canRetry: boolean;
  context: ContextPanelState;
  drawer: DrawerState;
  recovery: RecoveryVM;
  recoveryPlan: RecoveryPlanVM;
}

/**
 * The single view model for the Message Investigation Workspace (architecture §15). Owned by the
 * module component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.messageMonitoring
 */
export default class MessageMonitoringModel extends JSONModel {
  public constructor() {
    const initial: MessageMonitoringState = {
      items: [],
      total: 0,
      grid: {
        busy: false,
        page: 1,
        pageSize: 50,
        sortBy: "startTime",
        sortDirection: "desc",
        groupByProperty: "",
        density: "compact",
      },
      criteria: {},
      activeSmartFilter: "",
      smartFilters: [],
      selectedMessageId: "",
      selectedMessageIds: [],
      bookmarkedIds: [],
      savedSearches: [],
      selectedSavedSearchId: "",
      savedLayouts: [],
      actions: [],
      newSavedSearchName: "",
      newLayoutName: "",
      advancedSearchOpen: false,
      moreParametersOpen: false,
      contextCollapsed: false,
      detailPageOpen: false,
      canRetry: false,
      context: { busy: false, context: null, related: [] },
      drawer: { expanded: false, activeTab: "overview", busy: false, detail: null },
      recovery: { busy: false, loaded: false, plan: null, pathBlock: "", outcome: null },
      recoveryPlan: {
        busy: false,
        rows: [],
        executableMessageIds: [],
        executableCount: 0,
        excludedCount: 0,
        results: [],
        summary: "",
        executed: false,
      },
    };
    super(initial);
  }
}
