/** One recorded HTTP call's timing and outcome. */
export interface HttpMetricSample {
  readonly method: string;
  /** Host + path, with the query string stripped (query values are not metric dimensions). */
  readonly endpoint: string;
  readonly status: number | undefined;
  readonly durationMs: number;
  readonly attempts: number;
  readonly succeeded: boolean;
  readonly timestamp: number;
}

/** Aggregated timing statistics for one endpoint. */
export interface HttpEndpointStats {
  readonly endpoint: string;
  readonly count: number;
  readonly errorCount: number;
  readonly totalDurationMs: number;
  readonly minDurationMs: number;
  readonly maxDurationMs: number;
  readonly averageDurationMs: number;
}

/**
 * In-process HTTP performance metrics recorder (architecture: "Metrics", "Performance timings",
 * "Request duration", §1/§13).
 *
 * Purely in-memory and per-instance — consistent with the stateless-backend constraint, this is
 * observability for the current process, not a persisted metrics store. A production deployment
 * would additionally export these samples to an APM/metrics backend; that exporter is a documented
 * future extension point (`export()`), not implemented here.
 */
export class HttpMetricsRecorder {
  private readonly samples: HttpMetricSample[] = [];
  private readonly maxSamples: number;

  public constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
  }

  /**
   * Records one completed call.
   * @param sample the timing/outcome sample.
   */
  public record(sample: HttpMetricSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * @param endpoint optional endpoint filter (host + path).
   * @returns the raw recorded samples, most recent last.
   */
  public getSamples(endpoint?: string): readonly HttpMetricSample[] {
    return endpoint === undefined
      ? [...this.samples]
      : this.samples.filter((sample) => sample.endpoint === endpoint);
  }

  /**
   * Aggregates recorded samples per endpoint.
   * @returns per-endpoint timing statistics.
   */
  public getStats(): readonly HttpEndpointStats[] {
    const byEndpoint = new Map<string, HttpMetricSample[]>();
    for (const sample of this.samples) {
      const bucket = byEndpoint.get(sample.endpoint) ?? [];
      bucket.push(sample);
      byEndpoint.set(sample.endpoint, bucket);
    }
    return Array.from(byEndpoint.entries()).map(([endpoint, samples]) =>
      HttpMetricsRecorder.aggregate(endpoint, samples),
    );
  }

  /** Clears all recorded samples. */
  public reset(): void {
    this.samples.length = 0;
  }

  private static aggregate(
    endpoint: string,
    samples: readonly HttpMetricSample[],
  ): HttpEndpointStats {
    const durations = samples.map((sample) => sample.durationMs);
    const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
    return {
      endpoint,
      count: samples.length,
      errorCount: samples.filter((sample) => !sample.succeeded).length,
      totalDurationMs,
      minDurationMs: Math.min(...durations),
      maxDurationMs: Math.max(...durations),
      averageDurationMs: totalDurationMs / samples.length,
    };
  }
}

/** Process-wide HTTP metrics recorder shared by every SDK HTTP client instance. */
export const httpMetricsRecorder = new HttpMetricsRecorder();
