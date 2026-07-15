import type { ODataFilterExpression } from "./ODataFilterExpression.js";
import type { ODataVersion } from "./ODataTypes.js";

/** Sort direction for {@link ODataQueryBuilder.orderBy}. */
export type ODataSortDirection = "asc" | "desc";

/**
 * Fluent builder for OData system query options (architecture: OData Framework, §5). Every SDK
 * list operation builds its query this way rather than assembling `$`-prefixed strings by hand.
 *
 * @example
 * new ODataQueryBuilder()
 *   .top(100)
 *   .skip(0)
 *   .filter(ODataFilter.eq("status", "FAILED"))
 *   .orderBy("startTime", "desc")
 *   .select("messageId", "status", "startTime")
 *   .expand("errorDetails")
 *   .count()
 *   .build();
 */
export class ODataQueryBuilder {
  private topValue: number | undefined;
  private skipValue: number | undefined;
  private filterValue: ODataFilterExpression | undefined;
  private readonly orderByClauses: string[] = [];
  private readonly selectFields: string[] = [];
  private readonly expandFields: string[] = [];
  private countRequested = false;

  /** Sets `$top`. */
  public top(value: number): this {
    this.topValue = value;
    return this;
  }

  /** Sets `$skip`. */
  public skip(value: number): this {
    this.skipValue = value;
    return this;
  }

  /** Sets `$filter` from a composed {@link ODataFilterExpression}. */
  public filter(expression: ODataFilterExpression): this {
    this.filterValue = expression;
    return this;
  }

  /** Appends an `$orderby` clause. */
  public orderBy(field: string, direction: ODataSortDirection = "asc"): this {
    this.orderByClauses.push(direction === "desc" ? `${field} desc` : field);
    return this;
  }

  /** Appends field(s) to `$select`. */
  public select(...fields: readonly string[]): this {
    this.selectFields.push(...fields);
    return this;
  }

  /** Appends navigation propert(y/ies) to `$expand`. */
  public expand(...fields: readonly string[]): this {
    this.expandFields.push(...fields);
    return this;
  }

  /** Requests a total count (`$count=true` on v4, `$inlinecount=allpages` on v2). */
  public count(value = true): this {
    this.countRequested = value;
    return this;
  }

  /**
   * Renders the accumulated options into the query-parameter record an HTTP call sends.
   * @param version target OData version (default `v4`); only affects filter literal rendering and
   *   the count option's parameter name.
   * @returns the `$`-prefixed query parameters.
   */
  public build(version: ODataVersion = "v4"): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    if (this.topValue !== undefined) {
      params.$top = this.topValue;
    }
    if (this.skipValue !== undefined) {
      params.$skip = this.skipValue;
    }
    if (this.filterValue !== undefined) {
      params.$filter = this.filterValue.render(version);
    }
    if (this.orderByClauses.length > 0) {
      params.$orderby = this.orderByClauses.join(",");
    }
    if (this.selectFields.length > 0) {
      params.$select = this.selectFields.join(",");
    }
    if (this.expandFields.length > 0) {
      params.$expand = this.expandFields.join(",");
    }
    if (this.countRequested) {
      if (version === "v2") {
        params.$inlinecount = "allpages";
      } else {
        params.$count = true;
      }
    }
    return params;
  }
}
