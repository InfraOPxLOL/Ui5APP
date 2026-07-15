import { getLogger } from "../../core/logging/logger.js";

/** One active polling subscription's bookkeeping. */
interface Subscription {
  readonly intervalMs: number;
  readonly timer: NodeJS.Timeout;
}

/**
 * Centralizes refresh/polling logic (architecture: Phase 6, Refresh Engine, §12). Manual refresh is
 * just calling a callback directly ({@link refreshNow}); automatic refresh is a named subscription
 * polling on an interval ({@link subscribe}/{@link unsubscribe}); {@link cancelAll} is the
 * cancellation seam a request/session teardown calls.
 *
 * Deliberately config-agnostic: resolving a *named* refresh profile (`config/refresh.json`, via
 * `ConfigService.getRefreshIntervals()`) into a concrete millisecond interval is the composition
 * root's job (`operations/OperationsEngineFactory.ts`) — this class only ever sees the resolved
 * number, consistent with every other engine's dependency-injection discipline.
 *
 * "Future WebSocket integration" (architecture note): the platform already has a WebSocket server
 * (`core/websocket/wsServer.ts`, Phase 1). A future phase's subscription callback can publish onto
 * it instead of (or alongside) whatever a polling client does today — no change to this class is
 * needed for that; `subscribe`'s callback is already just "do something on this interval."
 */
export class RefreshEngine {
  private readonly logger = getLogger("operations.refresh");
  private readonly subscriptions = new Map<string, Subscription>();

  /**
   * Runs `callback` immediately, once, outside any subscription interval.
   * @param callback the refresh action to run.
   */
  public async refreshNow(callback: () => Promise<void>): Promise<void> {
    await callback();
  }

  /**
   * Starts (or restarts, replacing any existing subscription under the same key) automatic polling.
   * @param key a stable subscription key (e.g. `dashboard:primary`).
   * @param intervalMs the polling interval, in milliseconds (already resolved from a named profile
   *   by the caller — see this class's own doc comment).
   * @param callback the refresh action to run on every tick. A rejection is logged, not thrown —
   *   one failed tick must never stop future ticks.
   */
  public subscribe(key: string, intervalMs: number, callback: () => Promise<void>): void {
    this.unsubscribe(key);
    const timer = setInterval(() => {
      callback().catch((error: unknown) => {
        this.logger.warn(
          { key, err: error instanceof Error ? error.message : String(error) },
          "operations.refresh.tickFailed",
        );
      });
    }, intervalMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this.subscriptions.set(key, { intervalMs, timer });
  }

  /**
   * Stops one subscription.
   * @param key the subscription key.
   */
  public unsubscribe(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (subscription !== undefined) {
      clearInterval(subscription.timer);
      this.subscriptions.delete(key);
    }
  }

  /** @returns whether a subscription is currently active for `key`. */
  public isSubscribed(key: string): boolean {
    return this.subscriptions.has(key);
  }

  /** Stops every active subscription — call on shutdown/session teardown. */
  public cancelAll(): void {
    for (const subscription of this.subscriptions.values()) {
      clearInterval(subscription.timer);
    }
    this.subscriptions.clear();
  }
}
