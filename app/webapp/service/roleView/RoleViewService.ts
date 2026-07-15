import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Roles row as returned by the backend. */
export interface RoleViewItem {
  readonly roleName: string;
  readonly description: string;
  readonly scopeCount: number;
}

/**
 * Data service for the Roles module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/role-view`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class RoleViewService extends BaseService {
  public constructor() {
    super("/api/v1/role-view");
  }

  /**
   * Retrieves a server-paginated page of Roles rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<RoleViewItem>> {
    return this.client.get<PagedResult<RoleViewItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
