import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Audit Trail row as returned by the backend. */
export interface AuditViewItem {
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly correlationId: string;
}

/**
 * Data service for the Audit Trail module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/audit-view`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class AuditViewService extends BaseService {
  public constructor() {
    super("/api/v1/audit-view");
  }

  /**
   * Retrieves a server-paginated page of Audit Trail rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<AuditViewItem>> {
    return this.client.get<PagedResult<AuditViewItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
