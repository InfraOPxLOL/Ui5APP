import type { DeploymentEvent, FailureTrend } from "../dto/RuntimeCenterDto.js";

const MAX_TIMELINE_EVENTS_PER_ARTIFACT = 100;
const MAX_FAILURE_SAMPLES = 10;
/** A sample is treated as materially different once it moves ≥10% away from the oldest kept sample. */
const TREND_RATIO = 0.1;

interface FailureSample {
  readonly at: number;
  readonly failedCount: number;
}

/**
 * Process-lifetime, in-memory state for the Runtime Center: Deployment Timeline events and the
 * per-flow failure-count samples used to derive {@link FailureTrend}.
 *
 * `RuntimeCenterEngine` is constructed fresh per request, exactly like every other engine
 * (architecture: Caching, §17), so state that must survive *across* requests — the Deployment
 * Timeline ("session only, future persistence ready" per spec) and failure trend (which needs more
 * than one sample over time) cannot live on the engine instance itself. This store is the same
 * "session-only singleton" idiom Recovery Center's `RecoveryStateStore` already established, applied
 * to Runtime Center: a single shared instance (`runtimeCenterStateStore`) lives for the Node
 * process's lifetime and is lost on restart. A future phase can back this with real persistence
 * without changing `RuntimeCenterEngine`'s public shape.
 *
 * Exported as a class (not just the singleton) so tests can construct an isolated instance instead
 * of sharing global state across test cases.
 */
export class RuntimeCenterStateStore {
  private readonly timelines = new Map<string, DeploymentEvent[]>();
  private readonly failureSamples = new Map<string, FailureSample[]>();

  /** Appends a Deployment Timeline event, most recent last, capped per artifact. */
  public recordTimelineEvent(event: DeploymentEvent): void {
    const existing = this.timelines.get(event.artifactId) ?? [];
    existing.push(event);
    if (existing.length > MAX_TIMELINE_EVENTS_PER_ARTIFACT) {
      existing.shift();
    }
    this.timelines.set(event.artifactId, existing);
  }

  /** Lists an artifact's Deployment Timeline, oldest first; empty when nothing has been recorded. */
  public listTimeline(artifactId: string): readonly DeploymentEvent[] {
    return this.timelines.get(artifactId) ?? [];
  }

  /** Records a flow's current failed-message count as a failure-trend sample. */
  public recordFailureSample(artifactId: string, failedCount: number): void {
    const existing = this.failureSamples.get(artifactId) ?? [];
    existing.push({ at: Date.now(), failedCount });
    if (existing.length > MAX_FAILURE_SAMPLES) {
      existing.shift();
    }
    this.failureSamples.set(artifactId, existing);
  }

  /**
   * Derives a flow's failure trend from its recorded samples.
   * @param artifactId the artifact to evaluate.
   * @returns `"stable"` until at least two samples have been recorded (an honest bootstrap default,
   *   not a fabricated trend).
   */
  public failureTrend(artifactId: string): FailureTrend {
    const existing = this.failureSamples.get(artifactId);
    if (existing === undefined || existing.length < 2) {
      return "stable";
    }
    const oldest = existing[0]!.failedCount;
    const newest = existing[existing.length - 1]!.failedCount;
    if (newest > oldest * (1 + TREND_RATIO)) {
      return "increasing";
    }
    if (newest < oldest * (1 - TREND_RATIO)) {
      return "decreasing";
    }
    return "stable";
  }
}

/** The shared singleton instance used throughout the backend. */
export const runtimeCenterStateStore: RuntimeCenterStateStore = new RuntimeCenterStateStore();
