/**
 * Generic counting/ranking helpers shared by `RuntimeEngine` (status distribution) and
 * `StatisticsEngine` (status/top-N distributions) — one implementation of "group by a derived key
 * and count" rather than a hand-rolled `reduce` per engine.
 */

/** One key → count pair (structurally compatible with the Operations DTO layer's `ValueCount`). */
export interface CountEntry {
  readonly value: string;
  readonly count: number;
}

/** One ranked key → count pair (structurally compatible with the Operations DTO layer's `RankedEntry`). */
export interface RankEntry {
  readonly key: string;
  readonly count: number;
}

/**
 * Groups `items` by a derived string key and counts each group.
 * @param items the items to group.
 * @param keyFn derives the grouping key for one item.
 * @returns one {@link CountEntry} per distinct key, in first-seen order.
 */
export function countByValue<T>(items: readonly T[], keyFn: (item: T) => string): CountEntry[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries(), ([value, count]) => ({ value, count }));
}

/**
 * Groups `items` by a derived string key, counts each group, and returns the top `limit` by count.
 * @param items the items to group.
 * @param keyFn derives the grouping key for one item.
 * @param limit maximum number of entries to return.
 * @returns the top entries, highest count first.
 */
export function topRanked<T>(
  items: readonly T[],
  keyFn: (item: T) => string,
  limit: number,
): RankEntry[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries(), ([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
