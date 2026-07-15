import type { QueueGrowthTrend, RecoveryHistoryEntry } from "../dto/RecoveryDto.js";

const MAX_HISTORY_ENTRIES = 200;
const MAX_SAMPLES_PER_QUEUE = 10;
/** A sample is treated as materially different once it moves ≥10% away from the oldest kept sample. */
const TREND_RATIO = 0.1;

interface QueueSample {
  readonly at: number;
  readonly messageCount: number;
}

/**
 * Process-lifetime, in-memory state for the Recovery Center: recovery history and the per-queue
 * message-count samples used to derive {@link QueueGrowthTrend}.
 *
 * `RecoveryEngine` is constructed fresh per request, exactly like every other engine (architecture:
 * Caching, §17), so state that must survive *across* requests — Recovery History ("session only,
 * future persistence ready" per spec) and growth trend (which needs more than one sample over time)
 * cannot live on the engine instance itself. This store is the same "session-only singleton" idiom
 * the frontend already uses (`PayloadLayoutService`, `BookmarkService`) applied server-side: a single
 * shared instance (`recoveryStateStore`) lives for the Node process's lifetime and is lost on
 * restart. A future phase can back this with real persistence without changing `RecoveryEngine`'s
 * public shape — callers only ever see {@link RecoveryHistoryEntry}/{@link QueueGrowthTrend}.
 *
 * Exported as a class (not just the singleton) so tests can construct an isolated instance instead
 * of sharing global state across test cases.
 */
export class RecoveryStateStore {
  private readonly history: RecoveryHistoryEntry[] = [];
  private readonly samples = new Map<string, QueueSample[]>();

  /** Prepends a new history entry (most recent first), capped at {@link MAX_HISTORY_ENTRIES}. */
  public recordHistory(entry: RecoveryHistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history.length = MAX_HISTORY_ENTRIES;
    }
  }

  /**
   * Replaces a previously recorded entry in place (e.g. `running` → `completed`).
   * @param recoveryId the entry to update.
   * @param next the replacement entry.
   * @returns the updated entry, or `undefined` when `recoveryId` isn't known.
   */
  public updateHistory(
    recoveryId: string,
    next: RecoveryHistoryEntry,
  ): RecoveryHistoryEntry | undefined {
    const index = this.history.findIndex((entry) => entry.recoveryId === recoveryId);
    if (index === -1) {
      return undefined;
    }
    this.history[index] = next;
    return next;
  }

  /** Finds one history entry by id. */
  public findHistory(recoveryId: string): RecoveryHistoryEntry | undefined {
    return this.history.find((entry) => entry.recoveryId === recoveryId);
  }

  /** Lists every history entry, most recent first. */
  public listHistory(): readonly RecoveryHistoryEntry[] {
    return this.history;
  }

  /** Records a queue's current message count as a growth-trend sample. */
  public recordSample(queueName: string, messageCount: number): void {
    const existing = this.samples.get(queueName) ?? [];
    existing.push({ at: Date.now(), messageCount });
    if (existing.length > MAX_SAMPLES_PER_QUEUE) {
      existing.shift();
    }
    this.samples.set(queueName, existing);
  }

  /**
   * Derives a queue's growth trend from its recorded samples.
   * @param queueName the queue to evaluate.
   * @returns `"stable"` until at least two samples have been recorded (an honest bootstrap default,
   *   not a fabricated trend).
   */
  public growthTrend(queueName: string): QueueGrowthTrend {
    const existing = this.samples.get(queueName);
    if (existing === undefined || existing.length < 2) {
      return "stable";
    }
    const oldest = existing[0]!.messageCount;
    const newest = existing[existing.length - 1]!.messageCount;
    if (newest > oldest * (1 + TREND_RATIO)) {
      return "growing";
    }
    if (newest < oldest * (1 - TREND_RATIO)) {
      return "shrinking";
    }
    return "stable";
  }
}

/** The shared singleton instance used throughout the backend. */
export const recoveryStateStore: RecoveryStateStore = new RecoveryStateStore();
