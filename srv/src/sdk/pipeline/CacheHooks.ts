/**
 * Optional caching hooks a {@link RequestPipeline} call may supply (architecture: Request
 * Pipeline, §7 — "Caching Hooks"). The pipeline itself has no caching policy opinion; it only calls
 * `read` before executing and `write` after a successful execution, when hooks are provided.
 */
export interface CacheHooks<T> {
  /** The cache key for this specific call (typically encodes tenant + operation + parameters). */
  readonly key: string;
  /**
   * Attempts to read a cached result.
   * @param key the cache key.
   * @returns the cached value, or `undefined` on a miss.
   */
  read(key: string): T | undefined;
  /**
   * Stores a successful result.
   * @param key the cache key.
   * @param value the result to cache.
   */
  write(key: string, value: T): void;
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/**
 * A simple in-memory, TTL-based cache implementing the {@link CacheHooks} contract — the default
 * caching strategy a caller can hand to {@link RequestPipeline}.
 *
 * Distinct from `core/memo/requestMemo` (Phase 1): that de-duplicates *in-flight* identical calls
 * and discards state the instant they settle; this caches *completed* results for a fixed TTL, so
 * repeated calls within the TTL window skip the network entirely. Purely in-process — consistent
 * with the stateless-backend constraint; each instance manages its own cache.
 */
export class MemoryCacheProvider<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  public constructor(private readonly ttlMs: number) {}

  /**
   * Builds a {@link CacheHooks} bound to this cache under one key.
   * @param key the cache key for this call.
   * @returns cache hooks for {@link RequestPipeline}.
   */
  public hooksFor(key: string): CacheHooks<T> {
    return {
      key,
      read: (k) => this.read(k),
      write: (k, value) => this.write(k, value),
    };
  }

  private read(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined || Date.now() >= entry.expiresAt) {
      return undefined;
    }
    return entry.value;
  }

  private write(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Clears every cached entry. */
  public clear(): void {
    this.entries.clear();
  }
}
