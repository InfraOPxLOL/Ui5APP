/**
 * Client-side search/filter utilities shared by every table's quick-search. Implements the one
 * search behaviour used across the product: case/diacritic-insensitive, token-based AND matching
 * over selected fields ("all typed words must appear somewhere in the row").
 */
export default class SearchUtils {
  /**
   * Normalizes text for matching: lowercase, diacritics stripped, whitespace collapsed.
   * @param value the raw text.
   * @returns the normalized text.
   */
  public static normalize(value: string): string {
    return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Splits a query into normalized tokens.
   * @param query the raw user query.
   * @returns the non-empty normalized tokens.
   */
  public static tokenize(query: string): string[] {
    return SearchUtils.normalize(query).split(" ").filter(Boolean);
  }

  /**
   * Tests whether an item matches a query: every query token must occur in at least one of the
   * item's searched field values.
   * @param item the row object.
   * @param query the raw user query (empty query matches everything).
   * @param keys the item properties to search.
   * @returns whether the item matches.
   */
  public static matches<T>(item: T, query: string, keys: readonly (keyof T)[]): boolean {
    const tokens = SearchUtils.tokenize(query);
    if (tokens.length === 0) {
      return true;
    }
    const haystack = SearchUtils.normalize(keys.map((key) => String(item[key] ?? "")).join(" "));
    return tokens.every((token) => haystack.includes(token));
  }

  /**
   * Filters items by a query over selected fields.
   * @param items the rows.
   * @param query the raw user query.
   * @param keys the item properties to search.
   * @returns the matching rows (the input array when the query is empty).
   */
  public static filter<T>(items: readonly T[], query: string, keys: readonly (keyof T)[]): T[] {
    if (SearchUtils.tokenize(query).length === 0) {
      return [...items];
    }
    return items.filter((item) => SearchUtils.matches(item, query, keys));
  }
}
