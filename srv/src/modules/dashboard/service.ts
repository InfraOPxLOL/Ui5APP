import type { DashboardSummaryDto } from "./dto.js";
import { requestMemo } from "../../core/memo/requestMemo.js";

/**
 * Aggregation service for the Dashboard module.
 *
 * The real implementation fans out across CPI monitoring APIs and composes a single summary,
 * de-duplicated via {@link requestMemo} so concurrent dashboards collapse to one upstream sweep.
 * Phase 1 returns a zeroed summary.
 */
export class DashboardService {
  /**
   * Retrieves the aggregated KPI summary for a tenant.
   * @param tenantId optional tenant id.
   * @returns the dashboard summary.
   */
  public async getSummary(tenantId?: string): Promise<DashboardSummaryDto> {
    return requestMemo.dedupe(`dashboard:summary:${tenantId ?? "default"}`, async () =>
      Promise.resolve({ totalMessages: 0, failedMessages: 0, activeQueues: 0, criticalAlerts: 0 }),
    );
  }
}

/** Shared service instance. */
export const dashboardService = new DashboardService();
