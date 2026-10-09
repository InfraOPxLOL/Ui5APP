import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  Interchange,
  ReportServerFilters,
} from "../../service/reportServer/ReportServerTypes";
import ReportServerFormatter, {
  type StatusTile,
} from "../../formatter/reportServer/ReportServerFormatter";
import { STANDARD_VIEW_KEY } from "../../core/services/views/SavedViewStore";

/** One entry of the views dropdown (`sap.m.VariantItem`). */
export interface ViewItem {
  key: string;
  title: string;
  /** The built-in standard view can be neither renamed nor deleted. */
  rename: boolean;
  remove: boolean;
}

/** One entry of the time-window dropdown. */
export interface TimePresetItem {
  key: string;
  text: string;
  code: string;
}

/** Shape of the Report Server view model. */
export interface ReportServerState {
  busy: boolean;
  detailBusy: boolean;
  /** Set when the tenant has no B2B monitoring (TPM not activated); the list is hidden. */
  unavailableMessage: string;
  filters: ReportServerFilters;
  /** Whether the advanced search fields are shown. */
  advanced: boolean;
  /** How many advanced fields are set (shown on the toggle). */
  advancedCount: number;
  timePresets: TimePresetItem[];
  views: ViewItem[];
  selectedViewKey: string;
  defaultViewKey: string;
  /** Filters changed since the selected view was applied. */
  viewModified: boolean;
  tiles: StatusTile[];
  summaryTruncated: boolean;
  items: Interchange[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  showingText: string;
  selectedId: string;
}

/** @returns the filters of a fresh screen. */
export function emptyFilters(): ReportServerFilters {
  return ReportServerFormatter.defaultFilters();
}

/**
 * The single view model of the Report Server module, exposed to the view as `view`.
 *
 * @namespace com.middlewareops.integrationportal.model.reportServer
 */
export default class ReportServerModel extends JSONModel {
  public constructor() {
    const initial: ReportServerState = {
      busy: false,
      detailBusy: false,
      unavailableMessage: "",
      filters: emptyFilters(),
      advanced: false,
      advancedCount: 0,
      timePresets: [],
      views: [],
      selectedViewKey: STANDARD_VIEW_KEY,
      defaultViewKey: STANDARD_VIEW_KEY,
      viewModified: false,
      tiles: [],
      summaryTruncated: false,
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
      showingText: "",
      selectedId: "",
    };
    super(initial);
  }
}
