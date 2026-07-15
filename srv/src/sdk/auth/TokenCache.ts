import type { CachedToken } from "./AuthTypes.js";

/**
 * In-memory token cache with expiry-aware reads, shared by any {@link IAuthProvider} that fetches
 * tokens (OAuth Client Credentials today; future mechanisms may reuse it too).
 *
 * A safety margin ({@link TokenCache.expirySkewMs}) is subtracted from the real expiry so a token
 * about to expire is treated as already expired — avoiding a request that starts with a
 * still-valid-by-one-millisecond token and gets rejected mid-flight. Purely in-process, consistent
 * with the stateless-backend constraint: on multi-instance deployments each instance refreshes its
 * own token independently, which is the correct behaviour for client-credentials tokens.
 */
export class TokenCache {
  private readonly entries = new Map<string, CachedToken>();
  private readonly expirySkewMs: number;

  public constructor(expirySkewMs = 30000) {
    this.expirySkewMs = expirySkewMs;
  }

  /**
   * Reads a cached token if present and not (nearly) expired.
   * @param key the cache key (typically `clientId + tokenUrl`).
   * @returns the cached token, or `undefined` when absent or expiring within the skew window.
   */
  public get(key: string): CachedToken | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined || Date.now() >= entry.expiresAt - this.expirySkewMs) {
      return undefined;
    }
    return entry;
  }

  /**
   * Stores a token with a relative time-to-live.
   * @param key the cache key.
   * @param value the token value.
   * @param ttlMs time-to-live in milliseconds, from now.
   */
  public set(key: string, value: string, ttlMs: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Evicts one cached token (or all tokens when no key is given) — used after an auth failure to
   * force a fresh fetch on the next call.
   * @param key the cache key to evict; omit to clear the whole cache.
   */
  public evict(key?: string): void {
    if (key === undefined) {
      this.entries.clear();
    } else {
      this.entries.delete(key);
    }
  }
}
