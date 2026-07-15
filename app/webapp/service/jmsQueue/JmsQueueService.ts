import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single JMS Queues row as returned by the backend. */
export interface JmsQueueItem {
  readonly queueName: string;
  readonly state: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly capacityUsedPct: number;
}

/** Result of a queue purge action. */
export interface PurgeResult {
  readonly queueName: string;
  readonly purgedCount: number;
}

/**
 * Data service for the JMS Queues module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/jms-queue`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class JmsQueueService extends BaseService {
  public constructor() {
    super("/api/v1/jms-queue");
  }

  /**
   * Retrieves a server-paginated page of JMS Queues rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<JmsQueueItem>> {
    return this.client.get<PagedResult<JmsQueueItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
  /**
   * Purges all messages from a queue.
   * @param queueName the target identifier.
   * @returns the action result.
   */
  public async purge(queueName: string): Promise<PurgeResult> {
    return this.client.post<PurgeResult>(this.path(encodeURIComponent(queueName) + "/purge"));
  }
}
