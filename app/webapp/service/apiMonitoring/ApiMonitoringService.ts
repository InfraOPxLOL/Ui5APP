import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single API Monitoring row as returned by the backend. */
export interface ApiMonitoringItem {
  readonly apiName: string;
  readonly status: string;
  readonly callsToday: number;
  readonly avgLatencyMs: number;
}

/**
 * Data service for the API Monitoring module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/api-monitoring`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class ApiMonitoringService extends BaseService {
  public constructor() {
    super("/api/v1/api-monitoring");
  }

  /**
   * Retrieves a server-paginated page of API Monitoring rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<ApiMonitoringItem>> {
    return this.client.get<PagedResult<ApiMonitoringItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
