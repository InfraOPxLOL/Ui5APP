import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  Interchange,
  InterchangeDetail,
  ReportServerFilters,
} from "../../service/reportServer/ReportServerTypes";
import type { StatusTile } from "../../formatter/reportServer/ReportServerFormatter";

/** The payload currently open in the detail viewer. */
export interface OpenPayload {
  id: string;
  direction: string;
  /** Toolbar text, e.g. "EDI · 1.2 KB". */
  label: string;
  text: string;
  editorType: string;
  format: string;
  sizeBytes: number;
  isBinary: boolean;
}

/** Shape of the Report Server view model. */
export interface ReportServerState {
  busy: boolean;
  detailBusy: boolean;
  payloadBusy: boolean;
  /** Set when the tenant has no B2B monitoring (TPM not activated); the list is hidden. */
  unavailableMessage: string;
  filters: ReportServerFilters;
  tiles: StatusTile[];
  summaryTruncated: boolean;
  items: Interchange[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  showingText: string;
  selectedId: string;
  detail: InterchangeDetail | null;
  payload: OpenPayload | null;
}

export function emptyFilters(): ReportServerFilters {
  return {
    dateFrom: null,
    dateTo: null,
    status: "",
    senderPartner: "",
    receiverPartner: "",
    documentStandard: "",
    messageType: "",
    controlNumber: "",
  };
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
      payloadBusy: false,
      unavailableMessage: "",
      filters: emptyFilters(),
      tiles: [],
      summaryTruncated: false,
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
      showingText: "",
      selectedId: "",
      detail: null,
      payload: null,
    };
    super(initial);
  }
}
