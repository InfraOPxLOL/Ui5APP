/**
 * OData system query options assembled by {@link ODataV4Helper.buildQueryOptions}.
 */
export interface ODataQueryOptions {
  readonly filter?: string;
  readonly orderby?: string;
  readonly skip?: number;
  readonly top?: number;
  readonly select?: readonly string[];
  readonly count?: boolean;
}

/**
 * Helper for translating typed query intent into OData system query parameters (`$filter`,
 * `$orderby`, `$skip`, `$top`, `$select`, `$count`). The backend ultimately talks OData to CPI;
 * this helper lets frontend services express paging/sorting uniformly and hands the backend a
 * clean, already-encoded query string.
 */
export default class ODataV4Helper {
  /**
   * Converts {@link ODataQueryOptions} into a plain record of `$`-prefixed query parameters,
   * suitable for passing as the `query` of an {@link ApiClient} request.
   * @param options the query options.
   * @returns a record of OData system query parameters (values are strings/numbers/booleans).
   */
  public static buildQueryOptions(
    options: ODataQueryOptions,
  ): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    if (options.filter !== undefined) {
      params.$filter = options.filter;
    }
    if (options.orderby !== undefined) {
      params.$orderby = options.orderby;
    }
    if (options.skip !== undefined) {
      params.$skip = options.skip;
    }
    if (options.top !== undefined) {
      params.$top = options.top;
    }
    if (options.select !== undefined && options.select.length > 0) {
      params.$select = options.select.join(",");
    }
    if (options.count === true) {
      params.$count = true;
    }
    return params;
  }
}
