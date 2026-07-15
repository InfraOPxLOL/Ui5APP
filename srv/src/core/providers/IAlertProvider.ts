import type { AlertEvent, ProviderContext, ProviderPage, ProviderPagedResult } from "./types.js";

/**
 * Access to alert events — raised by the platform's own sweeps (failed messages, queue capacity,
 * certificate expiry) or relayed from SAP Alert Notification Service.
 *
 * Backing the Alert Center module and the shell's notification bell. Implementations may fan in
 * multiple sources; consumers see one normalized {@link AlertEvent} stream. Publishing to the live
 * WebSocket feed is the implementation's concern, not part of this contract.
 */
export interface IAlertProvider {
  /**
   * Queries alert events, newest first.
   * @param context the tenant/correlation context.
   * @param page the paging instruction.
   * @param severity optional severity filter.
   * @returns one page of alerts plus the total count.
   */
  queryAlerts(
    context: ProviderContext,
    page: ProviderPage,
    severity?: string,
  ): Promise<ProviderPagedResult<AlertEvent>>;

  /**
   * Reads a single alert by id.
   * @param context the tenant/correlation context.
   * @param alertId the alert id.
   * @returns the alert, or `undefined` when unknown.
   */
  getAlert(context: ProviderContext, alertId: string): Promise<AlertEvent | undefined>;
}
