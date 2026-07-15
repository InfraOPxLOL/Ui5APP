import {
  ODataComparisonExpression,
  ODataCompositeExpression,
  ODataFunctionExpression,
  ODataNotExpression,
  type ODataFilterExpression,
} from "./ODataFilterExpression.js";
import type { ODataLiteral } from "./ODataTypes.js";

/**
 * Fluent factory for {@link ODataFilterExpression} trees — the only sanctioned way to build an
 * OData `$filter` value. Composing expressions this way (rather than concatenating strings)
 * guarantees correct literal quoting/escaping and precedence parenthesization for every filter the
 * SDK ever sends.
 *
 * @example
 * ODataFilter.and(
 *   ODataFilter.eq("status", "FAILED"),
 *   ODataFilter.contains("integrationFlow", "Order"),
 * )
 */
export class ODataFilter {
  /** `field eq value` */
  public static eq(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "eq", value);
  }

  /** `field ne value` */
  public static ne(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "ne", value);
  }

  /** `field gt value` */
  public static gt(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "gt", value);
  }

  /** `field ge value` */
  public static ge(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "ge", value);
  }

  /** `field lt value` */
  public static lt(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "lt", value);
  }

  /** `field le value` */
  public static le(field: string, value: ODataLiteral): ODataFilterExpression {
    return new ODataComparisonExpression(field, "le", value);
  }

  /** `contains(field,'value')` */
  public static contains(field: string, value: string): ODataFilterExpression {
    return new ODataFunctionExpression("contains", field, value);
  }

  /** `startswith(field,'value')` */
  public static startswith(field: string, value: string): ODataFilterExpression {
    return new ODataFunctionExpression("startswith", field, value);
  }

  /** `endswith(field,'value')` */
  public static endswith(field: string, value: string): ODataFilterExpression {
    return new ODataFunctionExpression("endswith", field, value);
  }

  /** Combines expressions with logical AND, each parenthesized. */
  public static and(...parts: readonly ODataFilterExpression[]): ODataFilterExpression {
    return new ODataCompositeExpression("and", parts);
  }

  /** Combines expressions with logical OR, each parenthesized. */
  public static or(...parts: readonly ODataFilterExpression[]): ODataFilterExpression {
    return new ODataCompositeExpression("or", parts);
  }

  /** Negates an expression. */
  public static not(expression: ODataFilterExpression): ODataFilterExpression {
    return new ODataNotExpression(expression);
  }
}
