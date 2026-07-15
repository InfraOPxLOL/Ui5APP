import type {
  MessageErrorDetail,
  MessageHeader,
  MessageLogFilter,
  MessageProcessingLog,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "./types.js";

/**
 * Read access to message processing logs (MPLs) on an Integration Suite tenant.
 *
 * Backing the Message Monitoring, Live Monitoring and Dashboard modules. Implementations translate
 * the platform's neutral {@link MessageLogFilter} into the upstream query language and map results
 * into {@link MessageProcessingLog} — no OData shapes cross this boundary.
 */
export interface IMonitoringProvider {
  /**
   * Queries message processing logs.
   * @param context the tenant/correlation context.
   * @param filter the filter criteria.
   * @param page the paging instruction.
   * @returns one page of matching logs plus the total match count.
   */
  queryMessageLogs(
    context: ProviderContext,
    filter: MessageLogFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<MessageProcessingLog>>;

  /**
   * Reads a single message processing log by message id.
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @returns the log entry, or `undefined` when the id is unknown.
   */
  getMessageLog(
    context: ProviderContext,
    messageId: string,
  ): Promise<MessageProcessingLog | undefined>;

  /**
   * Reads the error details attached to a failed message.
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @returns the error details (empty when the message has none).
   */
  getErrorDetails(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly MessageErrorDetail[]>;

  /**
   * Counts messages per status within a time window — the dashboard KPI aggregation.
   * @param context the tenant/correlation context.
   * @param fromIso window start (ISO 8601).
   * @param toIso window end (ISO 8601).
   * @returns a map of status → count.
   */
  countByStatus(
    context: ProviderContext,
    fromIso: string,
    toIso: string,
  ): Promise<Readonly<Record<string, number>>>;

  /**
   * Reads a message's custom header properties (`MessageProcessingLogs('id')/CustomHeaderProperties`
   * — a live nav property, distinct from the standard/system headers CPI does not expose per-message
   * today). Used to resolve JMS-bridge routing headers such as `CH-Message-Queue`.
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @returns the custom header entries (empty when the message has none, or is unknown).
   */
  getCustomHeaders(context: ProviderContext, messageId: string): Promise<readonly MessageHeader[]>;
}
