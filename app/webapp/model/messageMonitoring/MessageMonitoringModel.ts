import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  MessageContext,
  MessageDetail,
  MessageMonitoringItem,
  MessageSearchCriteria,
  RelatedMessageGroup,
  SmartFilter,
} from "../../service/messageMonitoring/MessageInvestigationTypes";
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
  quickSearchTerm: string;
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

/** JMS classification/retry-resolution view-model shape (§ JMS Retry). */
export interface JmsRetryVM {
  busy: boolean;
  checked: boolean;
  eligible: boolean;
  reason: string;
  resolvedQueue: string;
  currentQueue: string;
  resolutionSource: string;
  retryCount: number | undefined;
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
  contextCollapsed: boolean;
  jmsFilter: "all" | "jms" | "nonJms";
  detailPageOpen: boolean;
  canRetry: boolean;
  context: ContextPanelState;
  drawer: DrawerState;
  jmsRetry: JmsRetryVM;
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
        quickSearchTerm: "",
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
      contextCollapsed: false,
      jmsFilter: "all",
      detailPageOpen: false,
      canRetry: false,
      context: { busy: false, context: null, related: [] },
      drawer: { expanded: false, activeTab: "overview", busy: false, detail: null },
      jmsRetry: {
        busy: false,
        checked: false,
        eligible: false,
        reason: "",
        resolvedQueue: "",
        currentQueue: "",
        resolutionSource: "unresolved",
        retryCount: undefined,
      },
    };
    super(initial);
  }
}
