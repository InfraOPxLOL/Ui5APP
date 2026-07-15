import JSONModel from "sap/ui/model/json/JSONModel";
import type { DashboardSummary } from "../../service/dashboard/DashboardService";
import type {
  OperationsOverview,
  OperationsSearchResponse,
} from "../../service/dashboard/OperationsTypes";

/** Live-refresh UI state for the Operations Workspace (§7). */
export interface RefreshUiState {
  auto: boolean;
  paused: boolean;
  refreshing: boolean;
  intervalMs: number;
  lastRefreshed: string;
  lastRefreshedText: string;
  error: string;
}

/** Environment/tenant awareness state (§10). */
export interface EnvironmentInfo {
  tenantName: string;
  tenantColor: string;
  environmentLabel: string;
  environmentKind: string;
  accent: string;
  show: boolean;
}

/** Workspace search state (§6). */
export interface OperationsSearchState {
  query: string;
  busy: boolean;
  result: OperationsSearchResponse | null;
}

/**
 * The single view model for the Operations Workspace (Phase 8), owned by the dashboard module
 * component under the `view` model name. Extends the original dashboard state additively with the
 * aggregated {@link OperationsOverview}, live-refresh, environment-awareness and search state.
 *
 * @namespace com.middlewareops.integrationportal.model.dashboard
 */
export interface DashboardState {
  summary: DashboardSummary;
  overview: OperationsOverview | null;
  loaded: boolean;
  busy: boolean;
  windowHours: number;
  timelineFilter: string;
  favorite: boolean;
  refresh: RefreshUiState;
  environment: EnvironmentInfo;
  search: OperationsSearchState;
}

/**
 * The Operations Workspace view model.
 *
 * @namespace com.middlewareops.integrationportal.model.dashboard
 */
export default class DashboardModel extends JSONModel {
  public constructor() {
    const initial: DashboardState = {
      summary: { totalMessages: 0, failedMessages: 0, activeQueues: 0, criticalAlerts: 0 },
      overview: null,
      loaded: false,
      busy: false,
      windowHours: 24,
      timelineFilter: "all",
      favorite: false,
      refresh: {
        auto: true,
        paused: false,
        refreshing: false,
        intervalMs: 30_000,
        lastRefreshed: "",
        lastRefreshedText: "",
        error: "",
      },
      environment: {
        tenantName: "",
        tenantColor: "",
        environmentLabel: "",
        environmentKind: "",
        accent: "",
        show: false,
      },
      search: { query: "", busy: false, result: null },
    };
    super(initial);
  }
}
