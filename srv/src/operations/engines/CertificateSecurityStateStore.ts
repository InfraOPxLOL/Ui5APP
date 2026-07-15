import type { CertificateTimelineEvent } from "../dto/CertificateSecurityDto.js";

const MAX_TIMELINE_EVENTS_PER_ALIAS = 100;

/**
 * Process-lifetime, in-memory state for the Certificate & Security Center: per-certificate Timeline
 * events.
 *
 * `CertificateSecurityEngine` is constructed fresh per request, exactly like every other engine
 * (architecture: Caching, §17), so the Timeline ("session only, future persistence ready" per spec)
 * cannot live on the engine instance itself. This store is the same "session-only singleton" idiom
 * Recovery Center's `RecoveryStateStore` and Runtime Center's `RuntimeCenterStateStore` already
 * established: a single shared instance (`certificateSecurityStateStore`) lives for the Node
 * process's lifetime and is lost on restart. A future phase can back this with real persistence
 * without changing `CertificateSecurityEngine`'s public shape.
 *
 * Exported as a class (not just the singleton) so tests can construct an isolated instance instead
 * of sharing global state across test cases.
 */
export class CertificateSecurityStateStore {
  private readonly timelines = new Map<string, CertificateTimelineEvent[]>();

  /** Appends a Timeline event, most recent last, capped per alias. */
  public recordTimelineEvent(event: CertificateTimelineEvent): void {
    const existing = this.timelines.get(event.alias) ?? [];
    existing.push(event);
    if (existing.length > MAX_TIMELINE_EVENTS_PER_ALIAS) {
      existing.shift();
    }
    this.timelines.set(event.alias, existing);
  }

  /** Lists a certificate's Timeline, oldest first; empty when nothing has been recorded. */
  public listTimeline(alias: string): readonly CertificateTimelineEvent[] {
    return this.timelines.get(alias) ?? [];
  }
}

/** The shared singleton instance used throughout the backend. */
export const certificateSecurityStateStore: CertificateSecurityStateStore =
  new CertificateSecurityStateStore();
