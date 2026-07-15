/**
 * In-flight request de-duplication (architecture §13).
 *
 * This is **not** a data cache. It coalesces concurrent identical operations that are in flight at
 * the same instant into a single upstream call, then forgets them the moment they settle. Nothing
 * survives past the resolution of the shared promise, so it holds no state between requests —
 * consistent with the stateless-backend constraint. Use it to protect CPI from thundering-herd
 * polling (e.g. several browser tabs hitting the dashboard aggregation simultaneously).
 */
export class RequestMemo {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Returns the in-flight promise for `key` if one exists; otherwise starts `factory`, shares its
   * promise under `key` until it settles, and returns it.
   * @param key a stable key identifying the operation (e.g. `dashboard:summary:tenant`).
   * @param factory produces the promise when there is no in-flight call.
   * @returns the shared promise result.
   */
  public async dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    const promise = factory().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }
}

/** Process-wide request-memo instance. */
export const requestMemo = new RequestMemo();
