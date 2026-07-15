import type { AlertNotificationClient } from "../../sdk/client/AlertNotificationClient.js";
import type { AlertEvent, ProviderPage } from "../../core/providers/types.js";
import type { NotificationSummary } from "../dto/NotificationDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import { OperationsCache } from "../cache/index.js";
import type { Severity } from "../transform/index.js";

const CRITICAL_SEVERITIES = new Set(["CRITICAL"]);
const ERROR_SEVERITIES = new Set(["ERROR", "HIGH"]);
const WARNING_SEVERITIES = new Set(["WARNING", "MEDIUM"]);

/**
 * Prepares notifications (architecture: Phase 6, Notification Engine, §13). Wraps
 * `sdk.alertNotification` today (itself either `RealAlertProvider`, backed by the SAP Alert
 * Notification Service, or `MockAlertProvider` — see `IntegrationSuiteSdkClient`'s `providerMode`);
 * ready to fan in additional sources behind the same {@link NotificationSummary} shape in a future
 * phase without any caller-visible change.
 */
export class NotificationEngine {
  public constructor(
    private readonly client: AlertNotificationClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Queries notifications, newest first.
   * @param page the paging instruction.
   * @param severity optional raw severity filter (passed through to the alert provider).
   * @returns a page of {@link NotificationSummary} plus the total count.
   */
  public async listNotifications(
    page: ProviderPage,
    severity?: string,
  ): Promise<SearchResult<NotificationSummary>> {
    const startedAt = Date.now();
    const result = await this.client.queryAlerts(page, severity);
    return {
      items: result.items.map(NotificationEngine.toSummary),
      total: result.total,
      tookMs: Date.now() - startedAt,
    };
  }

  /**
   * Reads a single notification by id.
   * @param notificationId the alert id.
   * @returns the notification, or `undefined` when unknown.
   */
  public async getNotification(notificationId: string): Promise<NotificationSummary | undefined> {
    return this.cache.dedupe(`notification.get:${notificationId}`, async () => {
      const alert = await this.client.getAlert(notificationId);
      return alert === undefined ? undefined : NotificationEngine.toSummary(alert);
    });
  }

  private static toSummary(alert: AlertEvent): NotificationSummary {
    return {
      notificationId: alert.alertId,
      severity: NotificationEngine.toSeverity(alert.severity),
      title: alert.title,
      description: alert.description,
      source: alert.source,
      raisedAt: alert.raisedAt,
      tags: alert.tags,
    };
  }

  private static toSeverity(rawSeverity: string): Severity {
    const normalized = rawSeverity.toUpperCase();
    if (CRITICAL_SEVERITIES.has(normalized)) {
      return "critical";
    }
    if (ERROR_SEVERITIES.has(normalized)) {
      return "error";
    }
    if (WARNING_SEVERITIES.has(normalized)) {
      return "warning";
    }
    return "info";
  }
}
