/** One entry in a raw-value → count breakdown (status distribution, runtime distribution, …). */
export interface ValueCount {
  readonly value: string;
  readonly count: number;
}

/** One entry in a "top N by count" ranking (top senders, top receivers, …). */
export interface RankedEntry {
  readonly key: string;
  readonly count: number;
}

/**
 * Aggregated KPIs over a live window of message/runtime data (architecture: Phase 6, Statistics
 * Engine, §5). Always computed fresh from the SDK — never persisted, never cached beyond the
 * request-scoped `OperationsCache` de-duplication.
 */
export interface StatisticsSummary {
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly totalMessages: number;
  readonly failedCount: number;
  readonly completedCount: number;
  readonly processingCount: number;
  readonly cancelledCount: number;
  readonly averageProcessingTimeMs: number | undefined;
  readonly maxProcessingTimeMs: number | undefined;
  readonly minProcessingTimeMs: number | undefined;
  readonly topSenders: readonly RankedEntry[];
  readonly topReceivers: readonly RankedEntry[];
  readonly topApplications: readonly RankedEntry[];
  readonly topMessageTypes: readonly RankedEntry[];
  readonly statusDistribution: readonly ValueCount[];
  readonly runtimeStatusDistribution: readonly ValueCount[];
}
