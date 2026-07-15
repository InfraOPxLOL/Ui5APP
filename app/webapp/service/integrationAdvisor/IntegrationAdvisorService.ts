import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Integration Advisor row as returned by the backend. */
export interface IntegrationAdvisorItem {
  readonly name: string;
  readonly artifactType: string;
  readonly status: string;
  readonly updatedAt: string;
}

/**
 * Data service for the Integration Advisor module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/integration-advisor`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class IntegrationAdvisorService extends BaseService {
  public constructor() {
    super("/api/v1/integration-advisor");
  }

  /**
   * Retrieves a server-paginated page of Integration Advisor rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<IntegrationAdvisorItem>> {
    return this.client.get<PagedResult<IntegrationAdvisorItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
