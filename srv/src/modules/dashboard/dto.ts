/**
 * Data transfer objects for the Dashboard module.
 */

/** Aggregated dashboard KPI summary. */
export interface DashboardSummaryDto {
  readonly totalMessages: number;
  readonly failedMessages: number;
  readonly activeQueues: number;
  readonly criticalAlerts: number;
}
