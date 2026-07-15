import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  PartnerDetail,
  PartnerSummary,
} from "../../service/coePartnerDashboard/CoePartnerDashboardTypes";

/** Shape of the Global Partner Master-Detail Dashboard view model. */
export interface PartnerDashboardState {
  busy: boolean;
  partnersLoaded: boolean;
  partners: PartnerSummary[];
  selectedPid: string | undefined;
  detailBusy: boolean;
  detail: PartnerDetail | null;
}

/**
 * The single view model for the Global Partner Master-Detail Dashboard workspace. Owned by the
 * controller and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.coePartnerDashboard
 */
export default class PartnerDashboardModel extends JSONModel {
  public constructor() {
    const initial: PartnerDashboardState = {
      busy: false,
      partnersLoaded: false,
      partners: [],
      selectedPid: undefined,
      detailBusy: false,
      detail: null,
    };
    super(initial);
  }
}
