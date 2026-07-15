/**
 * Supported OData comparison operators for {@link FilterCondition}.
 */
export type FilterOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "contains" | "startswith";

/** A single typed filter condition against a field. */
export interface FilterCondition {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: string | number | boolean | Date;
}

/**
 * Builds OData v2/v4 `$filter` expressions from typed conditions, shared by every module's filter
 * bar. Centralizing this prevents each module from hand-concatenating (and mis-escaping) filter
 * strings. Conditions are combined with logical AND; string values are quote-escaped.
 */
export default class FilterBuilder {
  private readonly conditions: FilterCondition[] = [];

  /**
   * Adds a condition. Conditions whose value is an empty string are ignored, so an empty filter
   * field never narrows the query.
   * @param condition the condition to add.
   * @returns this builder, for chaining.
   */
  public add(condition: FilterCondition): this {
    if (condition.value !== "") {
      this.conditions.push(condition);
    }
    return this;
  }

  /**
   * @returns the composed `$filter` string, or `undefined` when no conditions are present.
   */
  public build(): string | undefined {
    if (this.conditions.length === 0) {
      return undefined;
    }
    return this.conditions.map((c) => FilterBuilder.renderCondition(c)).join(" and ");
  }

  private static renderCondition(condition: FilterCondition): string {
    const literal = FilterBuilder.renderLiteral(condition.value);
    switch (condition.operator) {
      case "contains":
        return `contains(${condition.field},${literal})`;
      case "startswith":
        return `startswith(${condition.field},${literal})`;
      default:
        return `${condition.field} ${condition.operator} ${literal}`;
    }
  }

  private static renderLiteral(value: string | number | boolean | Date): string {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return `'${value.replace(/'/g, "''")}'`;
  }
}
