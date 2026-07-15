import type { ODataLiteral, ODataVersion } from "./ODataTypes.js";

/**
 * A composable OData `$filter` expression node. Every node renders itself to the correct string
 * for a given {@link ODataVersion} — literal encoding differs between v2 and v4 (notably date/time
 * literals), so rendering is version-parametrized rather than baked in at construction time.
 * Built via the {@link ODataFilter} factory, not by constructing these classes directly.
 */
export interface ODataFilterExpression {
  render(version: ODataVersion): string;
}

/** Comparison operators supported by {@link ODataFilter}'s leaf factories. */
export type ODataComparisonOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le";

/** A field-operator-value comparison (e.g. `status eq 'FAILED'`). */
export class ODataComparisonExpression implements ODataFilterExpression {
  public constructor(
    private readonly field: string,
    private readonly operator: ODataComparisonOperator,
    private readonly value: ODataLiteral,
  ) {}

  public render(version: ODataVersion): string {
    return `${this.field} ${this.operator} ${renderODataLiteral(this.value, version)}`;
  }
}

/** String functions supported by {@link ODataFilter}'s function factories. */
export type ODataStringFunction = "contains" | "startswith" | "endswith";

/** A string-function call (e.g. `contains(integrationFlow,'Order')`). */
export class ODataFunctionExpression implements ODataFilterExpression {
  public constructor(
    private readonly fn: ODataStringFunction,
    private readonly field: string,
    private readonly value: string,
  ) {}

  public render(version: ODataVersion): string {
    return `${this.fn}(${this.field},${renderODataLiteral(this.value, version)})`;
  }
}

/** A logical AND/OR combination of sub-expressions, each parenthesized to preserve precedence. */
export class ODataCompositeExpression implements ODataFilterExpression {
  public constructor(
    private readonly operator: "and" | "or",
    private readonly parts: readonly ODataFilterExpression[],
  ) {}

  public render(version: ODataVersion): string {
    return this.parts.map((part) => `(${part.render(version)})`).join(` ${this.operator} `);
  }
}

/** A logical negation of a sub-expression. */
export class ODataNotExpression implements ODataFilterExpression {
  public constructor(private readonly inner: ODataFilterExpression) {}

  public render(version: ODataVersion): string {
    return `not (${this.inner.render(version)})`;
  }
}

/**
 * Renders a literal value per OData version rules: strings are single-quoted with embedded quotes
 * doubled; numbers/booleans are unquoted; dates use the `datetime'...'` literal in v2 and a bare
 * ISO 8601 string in v4 (per the respective Edm.DateTime / Edm.DateTimeOffset literal syntax).
 *
 * OData v2's `Edm.DateTime` literal grammar (`datetime'yyyy-mm-ddThh:mm:ss[.fffffff]'`) has **no**
 * timezone designator — unlike `Edm.DateTimeOffset`, which `datetimeoffset'...'` would carry one
 * for. `Date.prototype.toISOString()` always appends a trailing `Z`, which is not valid inside a v2
 * `datetime'...'` literal; SAP Integration Suite's OData v1 Monitoring API (and CPI's OData v2 stack
 * generally) rejects such a filter with an HTTP 400 rather than a parse error inside the payload, so
 * the trailing `Z` is stripped for v2 specifically. The underlying instant is unchanged (Edm.DateTime
 * has no offset to begin with — CPI's `LogStart` etc. are always UTC wall-clock values).
 * @param value the literal value.
 * @param version the target OData version.
 * @returns the rendered literal.
 */
export function renderODataLiteral(value: ODataLiteral, version: ODataVersion): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    const iso = value.toISOString();
    return version === "v2" ? `datetime'${iso.replace(/Z$/, "")}'` : iso;
  }
  return `'${value.replace(/'/g, "''")}'`;
}
