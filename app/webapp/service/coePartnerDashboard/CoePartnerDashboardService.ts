import BaseService from "../../core/base/BaseService";
import type { PartnerDetail, PartnerList } from "./CoePartnerDashboardTypes";

/**
 * Data service for the Global Partner Master-Detail Dashboard workspace. Consumes **only**
 * `/api/v1/coe-partner-dashboard`, composed entirely from the Operations Engine's Partner Directory
 * engine.
 */
export default class CoePartnerDashboardService extends BaseService {
  public constructor() {
    super("/api/v1/coe-partner-dashboard");
  }

  /**
   * Loads the master list of known partners (derived from both agreement registries).
   * @param signal optional abort signal.
   * @returns the master list.
   */
  public async listPartners(signal?: AbortSignal): Promise<PartnerList> {
    return this.client.get<PartnerList>(this.path(), { signal });
  }

  /**
   * Loads the reverse-engineered detail view for one Partner ID.
   * @param pid the Partner ID to inspect.
   * @param signal optional abort signal.
   * @returns the detail view.
   */
  public async getPartnerDetail(pid: string, signal?: AbortSignal): Promise<PartnerDetail> {
    return this.client.get<PartnerDetail>(this.path("detail"), { query: { pid }, signal });
  }
}
