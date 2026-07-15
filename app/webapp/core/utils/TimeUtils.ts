/**
 * Time, interval and scheduling utilities: millisecond conversions plus the debounce/throttle
 * helpers every auto-refreshing view needs. Pure except for the returned timer-driven functions.
 */
export default class TimeUtils {
  /** Milliseconds per second. */
  public static readonly SECOND_MS = 1000;
  /** Milliseconds per minute. */
  public static readonly MINUTE_MS = 60_000;
  /** Milliseconds per hour. */
  public static readonly HOUR_MS = 3_600_000;
  /** Milliseconds per day. */
  public static readonly DAY_MS = 86_400_000;

  /**
   * @param seconds a duration in seconds.
   * @returns the duration in milliseconds.
   */
  public static secondsToMs(seconds: number): number {
    return seconds * TimeUtils.SECOND_MS;
  }

  /**
   * @param millis a duration in milliseconds.
   * @returns the whole number of seconds it spans (floor).
   */
  public static msToSeconds(millis: number): number {
    return Math.floor(millis / TimeUtils.SECOND_MS);
  }

  /**
   * Debounces a function: the wrapped call runs only after `waitMs` of call-silence. Used by
   * search-as-you-type filters so a keystroke burst issues one request.
   * @param fn the function to debounce.
   * @param waitMs the silence window in milliseconds.
   * @returns the debounced wrapper (with a `cancel()` to drop a pending call).
   */
  public static debounce<A extends unknown[]>(
    fn: (...args: A) => void,
    waitMs: number,
  ): ((...args: A) => void) & { cancel: () => void } {
    let timer: number | undefined;
    const wrapped = (...args: A): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, waitMs);
    };
    wrapped.cancel = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    return wrapped;
  }

  /**
   * Throttles a function: at most one execution per `intervalMs`, trailing call preserved. Used by
   * live-feed handlers so a message burst repaints at a bounded rate.
   * @param fn the function to throttle.
   * @param intervalMs the minimum interval between executions.
   * @returns the throttled wrapper (with a `cancel()` to drop a pending trailing call).
   */
  public static throttle<A extends unknown[]>(
    fn: (...args: A) => void,
    intervalMs: number,
  ): ((...args: A) => void) & { cancel: () => void } {
    let lastRun = 0;
    let timer: number | undefined;
    let pendingArgs: A | undefined;
    const run = (args: A): void => {
      lastRun = Date.now();
      fn(...args);
    };
    const wrapped = (...args: A): void => {
      const elapsed = Date.now() - lastRun;
      if (elapsed >= intervalMs) {
        run(args);
        return;
      }
      pendingArgs = args;
      if (timer === undefined) {
        timer = window.setTimeout(() => {
          timer = undefined;
          if (pendingArgs !== undefined) {
            const args2 = pendingArgs;
            pendingArgs = undefined;
            run(args2);
          }
        }, intervalMs - elapsed);
      }
    };
    wrapped.cancel = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      pendingArgs = undefined;
    };
    return wrapped;
  }
}
