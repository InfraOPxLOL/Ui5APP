import BaseService from "../../core/base/BaseService";

/** Aggregated dashboard KPI summary, computed server-side across CPI APIs. */
export interface DashboardSummary {
  readonly totalMessages: number;
  readonly failedMessages: number;
  readonly activeQueues: number;
  readonly criticalAlerts: number;
}

/**
 * Data service for the Dashboard module. Retrieves a single aggregated summary so the client makes
 * one round trip rather than fanning out to each monitoring API itself.
 */
export default class DashboardService extends BaseService {
  public constructor() {
    super("/api/v1/dashboard");
  }

  /**
   * Retrieves the aggregated KPI summary.
   * @returns the dashboard summary.
   */
  public async getSummary(): Promise<DashboardSummary> {
    return this.client.get<DashboardSummary>(this.path("summary"));
  }
}
