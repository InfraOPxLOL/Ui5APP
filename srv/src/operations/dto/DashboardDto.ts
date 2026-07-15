import type { StatisticsSummary } from "./StatisticsDto.js";
import type { NotificationSummary } from "./NotificationDto.js";
import type { HealthStatus } from "../transform/index.js";

/**
 * The single composed view a future Dashboard screen consumes (architecture: Phase 6, DTO Layer,
 * §14). Purely a data-aggregation DTO — this phase builds no Dashboard UI; `OperationsEngine.
 * getDashboardSummary()` is the business-logic composition a future UI phase calls into.
 */
export interface DashboardSummary {
  readonly statistics: StatisticsSummary;
  readonly runtimeHealthCounts: Readonly<Record<HealthStatus, number>>;
  readonly recentNotifications: readonly NotificationSummary[];
  readonly generatedAt: string;
}
