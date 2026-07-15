import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Alerts row as returned by the backend. */
export interface AlertNotificationItem {
  readonly alertId: string;
  readonly severity: string;
  readonly title: string;
  readonly source: string;
  readonly raisedAt: string;
}

/**
 * Data service for the Alerts module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/alert-notification`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class AlertNotificationService extends BaseService {
  public constructor() {
    super("/api/v1/alert-notification");
  }

  /**
   * Retrieves a server-paginated page of Alerts rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<AlertNotificationItem>> {
    return this.client.get<PagedResult<AlertNotificationItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
}
