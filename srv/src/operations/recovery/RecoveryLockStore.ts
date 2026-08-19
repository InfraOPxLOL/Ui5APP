/**
 * How long a completed recovery is remembered, so a second attempt in that window is reported as
 * "already processed" rather than silently re-running against the tenant. Chosen to comfortably
 * outlast the time it takes a retried message to reappear in the MPL, which is the signal an
 * operator would otherwise be waiting on before knowing not to click again.
 */
const COMPLETED_TTL_MS = 15 * 60_000;

/** Safety valve: a lock older than this is treated as abandoned (its holder crashed mid-request). */
const LOCK_STALE_MS = 5 * 60_000;

/** Cap on remembered completions, so a long-running process cannot grow this map without bound. */
const MAX_COMPLETED_ENTRIES = 5_000;

/** The result of attempting to claim a message for recovery. */
export type LockAcquisition =
  | { readonly kind: "acquired" }
  /** Another caller is executing a recovery for this message right now. */
  | { readonly kind: "in-flight"; readonly sinceIso: string }
  /** A recovery for this message completed recently — re-running would duplicate it. */
  | { readonly kind: "already-processed"; readonly atIso: string; readonly note: string };

interface HeldLock {
  readonly acquiredAtMs: number;
}

interface CompletedRecovery {
  readonly atMs: number;
  readonly note: string;
}

/**
 * Process-lifetime guard preventing two callers from recovering the same message simultaneously
 * (Phase 13, §10).
 *
 * The backend is authoritative here by design: the frontend disabling a button is convenience, not
 * protection — two operators on two browsers, or a double-submit, must not produce two moves and two
 * retries of the same message. Every recovery therefore claims the message before touching the
 * tenant and releases it in a `finally`.
 *
 * Same idiom as {@link module:../engines/RecoveryStateStore.RecoveryStateStore}: engines are
 * constructed fresh per request (architecture: Caching, §17), so cross-request state cannot live on
 * an engine instance. Node's single-threaded event loop makes the check-then-set in
 * {@link tryAcquire} atomic — there is no `await` between reading and writing, so no interleaving is
 * possible.
 *
 * **Scope limit, stated plainly:** this guards one Node process. A multi-instance Cloud Foundry
 * deployment would need shared state (Redis or a database) to guard across instances. That is out of
 * scope while §11 forbids introducing persistence, and is called out rather than left implicit.
 *
 * Exported as a class as well as a singleton so tests can use an isolated instance.
 */
export class RecoveryLockStore {
  private readonly locks = new Map<string, HeldLock>();
  private readonly completed = new Map<string, CompletedRecovery>();

  public constructor(
    private readonly completedTtlMs: number = COMPLETED_TTL_MS,
    private readonly lockStaleMs: number = LOCK_STALE_MS,
  ) {}

  /**
   * Claims a message for recovery.
   *
   * @param messageId the message to claim.
   * @returns `acquired` when the caller may proceed; `in-flight` when another caller holds the lock;
   *   `already-processed` when a recovery completed within the TTL. Callers must {@link release}
   *   an acquired lock in a `finally`.
   */
  public tryAcquire(messageId: string): LockAcquisition {
    const now = Date.now();

    const recent = this.completed.get(messageId);
    if (recent !== undefined) {
      if (now - recent.atMs < this.completedTtlMs) {
        return {
          kind: "already-processed",
          atIso: new Date(recent.atMs).toISOString(),
          note: recent.note,
        };
      }
      this.completed.delete(messageId);
    }

    const held = this.locks.get(messageId);
    if (held !== undefined) {
      // A lock whose holder died mid-request would otherwise block this message for the process's
      // lifetime, so an abandoned one is reclaimed rather than trusted forever.
      if (now - held.acquiredAtMs < this.lockStaleMs) {
        return { kind: "in-flight", sinceIso: new Date(held.acquiredAtMs).toISOString() };
      }
    }

    this.locks.set(messageId, { acquiredAtMs: now });
    return { kind: "acquired" };
  }

  /**
   * Releases a claim.
   * @param messageId the message to release.
   * @param completedNote when given, the recovery is remembered as completed for the TTL, so a
   *   repeat attempt reports `already-processed`. Omit it when the attempt did not actually reach
   *   the tenant, so the operator can retry immediately.
   */
  public release(messageId: string, completedNote?: string): void {
    this.locks.delete(messageId);
    if (completedNote !== undefined) {
      this.rememberCompletion(messageId, completedNote);
    }
  }

  /** @returns whether a recovery is currently in flight for this message. */
  public isInFlight(messageId: string): boolean {
    const held = this.locks.get(messageId);
    return held !== undefined && Date.now() - held.acquiredAtMs < this.lockStaleMs;
  }

  /** Clears all locks and completion memory — test isolation only. */
  public reset(): void {
    this.locks.clear();
    this.completed.clear();
  }

  private rememberCompletion(messageId: string, note: string): void {
    if (this.completed.size >= MAX_COMPLETED_ENTRIES) {
      // Evict the oldest insertion; Map preserves insertion order.
      const oldest = this.completed.keys().next();
      if (!oldest.done) {
        this.completed.delete(oldest.value);
      }
    }
    this.completed.set(messageId, { atMs: Date.now(), note });
  }
}

/** The shared singleton used throughout the backend. */
export const recoveryLockStore: RecoveryLockStore = new RecoveryLockStore();
