import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Administration row as returned by the backend. */
export interface AdministrationItem {
  readonly destinationName: string;
  readonly tenantLabel: string;
  readonly status: string;
  readonly baseUrl: string;
}

/**
 * Data service for the Administration module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/administration`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class AdministrationService extends BaseService {
  public constructor() {
    super("/api/v1/administration");
  }

  /**
   * Retrieves a server-paginated page of Administration rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<AdministrationItem>> {
    return this.client.get<PagedResult<AdministrationItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
