import BaseService from "../../core/base/BaseService";
import type {
  JmsEligibility,
  JmsRetryCheck,
  JmsRetryResult,
  MessageContext,
  MessageDetail,
  MessageExportFormat,
  MessageMonitoringPage,
  MessageSearchCriteria,
  RelatedMessageGroup,
} from "./MessageInvestigationTypes";

/**
 * Data service for the Message Investigation Workspace. Consumes **only**
 * `/api/v1/message-monitoring`, which the backend composes entirely from the Operations Engine — the
 * workspace never talks to the SDK, never knows an Integration Suite endpoint, and only ever handles
 * Operations DTOs (architecture: UI → Operations Engine → SDK → Integration Suite).
 */
export default class MessageMonitoringService extends BaseService {
  public constructor() {
    super("/api/v1/message-monitoring");
  }

  /**
   * Retrieves a server-paginated, enriched page of investigation rows.
   * @param criteria the advanced-search criteria (client-only fields are stripped before sending).
   * @param page 1-based page number.
   * @param pageSize page size.
   * @param sortBy optional sort field.
   * @param sortDirection sort direction (defaults to `desc`).
   * @param signal optional abort signal for superseded searches.
   * @returns the paginated rows.
   */
  public async list(
    criteria: MessageSearchCriteria,
    page: number,
    pageSize: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    signal?: AbortSignal,
  ): Promise<MessageMonitoringPage> {
    return this.client.get<MessageMonitoringPage>(this.path(), {
      query: {
        ...MessageMonitoringService.toQuery(criteria),
        page,
        pageSize,
        sortBy,
        sortDirection,
      },
      signal,
    });
  }

  /**
   * Loads a message's full investigation detail.
   * @param messageId the message id.
   * @param signal optional abort signal.
   * @returns the full detail.
   */
  public async getById(messageId: string, signal?: AbortSignal): Promise<MessageDetail> {
    return this.client.get<MessageDetail>(this.path(encodeURIComponent(messageId)), { signal });
  }

  /**
   * Loads the related-message groups for a message (§ Related Messages).
   * @param messageId the message id.
   * @param signal optional abort signal.
   * @returns the related-message groups.
   */
  public async getRelated(
    messageId: string,
    signal?: AbortSignal,
  ): Promise<readonly RelatedMessageGroup[]> {
    return this.client.get<readonly RelatedMessageGroup[]>(
      this.path(`${encodeURIComponent(messageId)}/related`),
      { signal },
    );
  }

  /**
   * Loads the investigation panel context for a message.
   * @param messageId the message id.
   * @param signal optional abort signal.
   * @returns the context.
   */
  public async getContext(messageId: string, signal?: AbortSignal): Promise<MessageContext> {
    return this.client.get<MessageContext>(this.path(`${encodeURIComponent(messageId)}/context`), {
      signal,
    });
  }

  /**
   * Requests a bulk export of the current filtered working set (§ Export). The backend renders the
   * content via the Operations Engine's Export Engine; this method returns the raw text so the
   * caller can hand it to {@link module:core/utils/DownloadUtils}.
   * @param criteria the advanced-search criteria driving the export's row set.
   * @param format the export format.
   * @returns the rendered content and its declared MIME type/file name are resolved by the caller
   * from the response — this method returns the raw text body.
   */
  public async exportRows(
    criteria: MessageSearchCriteria,
    format: MessageExportFormat,
  ): Promise<string> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(MessageMonitoringService.toQuery(criteria))) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    query.set("format", format);
    const response = await fetch(`/api/v1/message-monitoring/export?${query.toString()}`, {
      credentials: "same-origin",
    });
    return response.text();
  }

  /**
   * Cheap classification: does this message's correlation chain show the JMS bridge flows? (§ JMS
   * Retry). Used to drive the JMS/Non-JMS toggle without paying for a full retry resolution per row.
   * @param messageId the message id.
   * @returns the classification.
   */
  public async checkJmsEligibility(messageId: string): Promise<JmsEligibility> {
    return this.client.get<JmsEligibility>(
      this.path(`${encodeURIComponent(messageId)}/jms-eligibility`),
    );
  }

  /**
   * Full JMS retry resolution: queue + current retry count, or why it could not be resolved (§ JMS
   * Retry). Only called when the operator actually opens the Retry action for a message.
   * @param messageId the message id.
   * @returns the resolution.
   */
  public async getRetryCheck(messageId: string): Promise<JmsRetryCheck> {
    return this.client.get<JmsRetryCheck>(this.path(`${encodeURIComponent(messageId)}/retry-check`));
  }

  /**
   * Executes a real JMS retry (§ JMS Retry).
   * @param messageId the message id to retry.
   * @param queueName the queue it currently sits on.
   * @param reason optional operator-supplied reason.
   * @returns the real retry outcome.
   */
  public async retry(
    messageId: string,
    queueName: string,
    reason?: string,
  ): Promise<JmsRetryResult> {
    return this.client.post<JmsRetryResult, { queueName: string; reason?: string }>(
      this.path(`${encodeURIComponent(messageId)}/retry`),
      { queueName, reason },
    );
  }

  private static toQuery(
    criteria: MessageSearchCriteria,
  ): Record<string, string | number | boolean | undefined> {
    return {
      status: criteria.status,
      severity: criteria.severity,
      sender: criteria.sender,
      receiver: criteria.receiver,
      messageType: criteria.messageType,
      customStatus: criteria.customStatus,
      applicationId: criteria.applicationId,
      integrationFlow: criteria.integrationFlow,
      correlationId: criteria.correlationId,
      queue: criteria.queue,
      search: criteria.search,
      dateFrom: criteria.dateFrom,
      dateTo: criteria.dateTo,
      durationMinMs: criteria.durationMinMs,
      durationMaxMs: criteria.durationMaxMs,
      smartFilter: criteria.smartFilter,
    };
  }
}
