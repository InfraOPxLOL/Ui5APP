import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Analytics row as returned by the backend. */
export interface AnalyticsItem {
  readonly metric: string;
  readonly value: number;
  readonly period: string;
}

/**
 * Data service for the Analytics module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/analytics`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class AnalyticsService extends BaseService {
  public constructor() {
    super("/api/v1/analytics");
  }

  /**
   * Retrieves a server-paginated page of Analytics rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<AnalyticsItem>> {
    return this.client.get<PagedResult<AnalyticsItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
