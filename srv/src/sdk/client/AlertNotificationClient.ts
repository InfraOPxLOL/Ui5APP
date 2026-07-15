import type { IAlertProvider } from "../../core/providers/IAlertProvider.js";
import type { AlertEvent, ProviderPage, ProviderPagedResult } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Alert notification sub-client (architecture: Integration Suite Client, §4 —
 * `AlertNotificationClient`). Thin facade over {@link IAlertProvider} — whose contract already
 * covers alerts "raised locally or relayed from SAP Alert Notification Service" (Phase 3) — for the
 * Alert Center module and the shell's notification bell.
 */
export class AlertNotificationClient {
  public constructor(
    private readonly provider: IAlertProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Queries alert events, newest first. See {@link IAlertProvider.queryAlerts}. */
  public queryAlerts(
    page: ProviderPage,
    severity?: string,
    context?: ClientCallContext,
  ): Promise<ProviderPagedResult<AlertEvent>> {
    return this.provider.queryAlerts(resolveContext(this.defaultTenantId, context), page, severity);
  }

  /** Reads a single alert by id. See {@link IAlertProvider.getAlert}. */
  public getAlert(alertId: string, context?: ClientCallContext): Promise<AlertEvent | undefined> {
    return this.provider.getAlert(resolveContext(this.defaultTenantId, context), alertId);
  }
}
