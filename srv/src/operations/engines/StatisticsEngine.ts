import type { MonitoringClient } from "../../sdk/client/MonitoringClient.js";
import type { RuntimeEngine } from "./RuntimeEngine.js";
import type { StatisticsSummary } from "../dto/StatisticsDto.js";
import { OperationsCache } from "../cache/index.js";
import { countByValue, topRanked } from "../transform/index.js";

/**
 * Upper bound on how many messages {@link StatisticsEngine.getStatistics} aggregates over — the
 * same documented, honest bounded-window approach `MessageEngine` uses (today's Monitoring API has
 * no server-side `$apply`/groupby support this SDK exposes, so aggregation happens over a fetched
 * working set rather than the tenant's entire history).
 */
const DEFAULT_STATISTICS_WINDOW_SIZE = 1000;
const TOP_N = 5;

/**
 * Aggregates live KPIs over a message/runtime working set (architecture: Phase 6, Statistics Engine,
 * §5). Never persists anything — every call recomputes from a fresh fetch (through
 * {@link OperationsCache} for in-flight de-duplication only).
 */
export class StatisticsEngine {
  public constructor(
    private readonly monitoringClient: MonitoringClient,
    private readonly runtimeEngine: RuntimeEngine,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Computes the full KPI set over a time window.
   * @param fromIso window start (ISO 8601).
   * @param toIso window end (ISO 8601).
   * @returns the aggregated statistics.
   */
  public async getStatistics(fromIso: string, toIso: string): Promise<StatisticsSummary> {
    return this.cache.dedupe(`statistics:${fromIso}:${toIso}`, async () => {
      const page = await this.monitoringClient.queryMessageLogs(
        { from: fromIso, to: toIso },
        { skip: 0, top: DEFAULT_STATISTICS_WINDOW_SIZE },
      );
      const logs = page.items;
      const durations = logs
        .map((log) => log.processingTimeMs)
        .filter((duration): duration is number => duration !== undefined);
      const statusDistribution = countByValue(logs, (log) => log.status.toUpperCase());
      const countOf = (status: string): number =>
        statusDistribution.find((entry) => entry.value === status)?.count ?? 0;

      return {
        windowFrom: fromIso,
        windowTo: toIso,
        totalMessages: page.total,
        failedCount: countOf("FAILED"),
        completedCount: countOf("COMPLETED"),
        processingCount: countOf("PROCESSING"),
        cancelledCount: countOf("CANCELLED"),
        averageProcessingTimeMs: StatisticsEngine.average(durations),
        maxProcessingTimeMs: durations.length > 0 ? Math.max(...durations) : undefined,
        minProcessingTimeMs: durations.length > 0 ? Math.min(...durations) : undefined,
        topSenders: topRanked(logs, (log) => log.sender, TOP_N),
        topReceivers: topRanked(logs, (log) => log.receiver, TOP_N),
        topApplications: topRanked(
          logs.filter((log) => log.applicationId !== undefined),
          (log) => log.applicationId ?? "",
          TOP_N,
        ),
        topMessageTypes: topRanked(
          logs.filter((log) => log.messageType !== undefined),
          (log) => log.messageType ?? "",
          TOP_N,
        ),
        statusDistribution,
        runtimeStatusDistribution: await this.runtimeEngine.getStatusDistribution(),
      };
    });
  }

  private static average(values: readonly number[]): number | undefined {
    if (values.length === 0) {
      return undefined;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
