import BaseService from "../../core/base/BaseService";
import ODataV4Helper, { type ODataQueryOptions } from "../../core/utils/ODataV4Helper";
import type { PagedResult } from "../../core/types/Api";

/** A single Message Replay row as returned by the backend. */
export interface MessageReplayItem {
  readonly messageId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly failedAt: string;
  readonly retryCount: number;
}

/** Result of a replay request. */
export interface ReplayResult {
  readonly messageId: string;
  readonly accepted: boolean;
  readonly correlationId: string;
}

/**
 * Data service for the Message Replay module. The only layer permitted to call the {@link ApiClient}.
 * All methods are wired to the real backend routes (`/api/v1/message-replay`); in Phase 1 the backend
 * returns typed placeholder results until the corresponding backend service is implemented.
 */
export default class MessageReplayService extends BaseService {
  public constructor() {
    super("/api/v1/message-replay");
  }

  /**
   * Retrieves a server-paginated page of Message Replay rows.
   * @param options OData-style paging/sorting/filtering options.
   * @returns a page of rows.
   */
  public async list(options: ODataQueryOptions = {}): Promise<PagedResult<MessageReplayItem>> {
    return this.client.get<PagedResult<MessageReplayItem>>(this.path(), {
      query: ODataV4Helper.buildQueryOptions(options),
    });
  }
  /**
   * Requests a replay/resend of a failed message.
   * @param messageId the target identifier.
   * @returns the action result.
   */
  public async replay(messageId: string): Promise<ReplayResult> {
    return this.client.post<ReplayResult>(this.path(encodeURIComponent(messageId) + "/replay"));
  }
}
