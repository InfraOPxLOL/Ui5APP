/**
 * Client-side mirror of the CoE Visual Rule Builder backend DTOs (`/api/v1/coe-rule-builder`,
 * composed entirely from the Operations Engine's Partner Directory engine). The base64/binary-
 * parameter storage detail never reaches this layer — the workspace only ever sees plain `Rule` JSON.
 */

export type IdentifyingQueryType = "property" | "xpath";

export interface IdentifyingQuery {
  readonly type: IdentifyingQueryType;
  readonly expression: string;
  readonly expectedValue: string;
}

export interface RuleTargetRouting {
  readonly targetPid: string;
  readonly routeKey: string;
}

export interface RuleSetRule {
  readonly kind: "ruleset";
  readonly ruleName: string;
  readonly identifyingQueries: readonly IdentifyingQuery[];
  readonly targetRouting: RuleTargetRouting;
}

export type XCastFilterType = "xpath_exists" | "property";

export interface XCastCondition {
  readonly filterType: XCastFilterType;
  readonly expression: string;
  readonly expectedValue: string;
}

export type XCastRoutingType = "JMS" | "ProcessDirect" | "Terminate";

export interface XCastOutput {
  readonly nodeType: "output";
  readonly routingType: XCastRoutingType;
  readonly target: string;
}

export interface XCastConditionNode {
  readonly nodeType: "condition";
  readonly conditionType: "if" | "elseIf";
  readonly condition: XCastCondition;
  readonly then: XCastNode;
  readonly next: XCastBranchNode | undefined;
}

export interface XCastElseNode {
  readonly nodeType: "else";
  readonly then: XCastNode;
}

export type XCastBranchNode = XCastConditionNode | XCastElseNode;
export type XCastNode = XCastBranchNode | XCastOutput;

export interface XCastRule {
  readonly kind: "xcast";
  readonly root: XCastConditionNode;
}

export type Rule = RuleSetRule | XCastRule;

/**
 * Recursively strips `readonly` so the Visual Rule Builder's X-Cast tree editor can mutate nodes in
 * place (the wire `Rule` types stay `readonly` — an API contract; this is purely an editing-time view).
 */
export type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

export type MutableXCastNode = Mutable<XCastNode>;
export type MutableXCastBranchNode = Mutable<XCastBranchNode>;
export type MutableXCastConditionNode = Mutable<XCastConditionNode>;

export interface RuleSummary {
  readonly pid: string;
  readonly id: string;
  readonly kind: "ruleset" | "xcast" | undefined;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

export interface RuleListDto {
  readonly pid: string;
  readonly rules: readonly RuleSummary[];
}

export interface RuleSaveRequest {
  readonly pid: string;
  readonly id: string;
  readonly rule: Rule;
}
