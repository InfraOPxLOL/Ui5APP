/**
 * The universal result envelope every `SearchEngine` method returns (architecture: Phase 6, Search
 * Engine, §3 — "Search should return strongly typed DTOs. No SDK objects should escape the
 * Operations Engine."). Generic over the summary DTO being searched, so one shape serves messages,
 * queues and certificates alike without a parallel `MessageSearchResult`/`QueueSearchResult`/… per
 * domain.
 */
export interface SearchResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly tookMs: number;
}
