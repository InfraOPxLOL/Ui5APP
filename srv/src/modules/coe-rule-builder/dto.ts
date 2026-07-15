/**
 * DTOs for the CoE Visual Rule Builder — authors the rule content a `RULESET_.{SNDPRN}.{RCVPRN}`
 * entry references (spec — Visual Rule Builder / Binary Parameters, deferred from the original CoE
 * framework message until Binary Parameter support existed).
 *
 * Storage model (confirmed against the live tenant's `$metadata`): a rule is one Partner Directory
 * **binary** parameter (`BinaryParameters` entity set, key `(Pid, Id)`, `ContentType` +
 * `Edm.Binary Value` with no `m:HasStream` — travels as a plain base64 string like any other JSON
 * field). Per the confirmed ruleset mechanism (`coe-router` module): `RULESET_.{SNDPRN}.{RCVPRN}`
 * (a *string* parameter) holds a comma-separated list of rule names; each name is the Id of a binary
 * parameter under the **same** registry PID (`_Maintain_JMS_Agreements` / `_Maintain_Router_Agreements`)
 * holding that rule's JSON, base64-encoded. Encoding/decoding happens entirely in this module — the
 * frontend only ever sees/sends plain `Rule` JSON over `/api/v1/coe-rule-builder`.
 *
 * Two rule kinds:
 * - **Agreement Ruleset** — a flat identifying-query list that decides whether this rule's target
 *   applies to an incoming message (Rule Name, Identifying Queries, Target Routing).
 * - **X-Cast Endpoint Resolver** — a nested if/else-if/else condition chain that resolves the final
 *   routing output (JMS / ProcessDirect / Terminate), allowing arbitrary nesting per branch.
 */

/** How one identifying query inspects the inbound message. */
export type IdentifyingQueryType = "property" | "xpath";

/** One identifying query: does this expression evaluate to the expected value? */
export interface IdentifyingQuery {
  readonly type: IdentifyingQueryType;
  readonly expression: string;
  readonly expectedValue: string;
}

/** Where an Agreement Ruleset rule routes a matching message. */
export interface RuleTargetRouting {
  readonly targetPid: string;
  readonly routeKey: string;
}

/** An Agreement Ruleset rule (spec — flat array: Rule Name, Identifying Queries, Target Routing). */
export interface RuleSetRule {
  readonly kind: "ruleset";
  readonly ruleName: string;
  readonly identifyingQueries: readonly IdentifyingQuery[];
  readonly targetRouting: RuleTargetRouting;
}

/** How an X-Cast branch's condition inspects the inbound message. */
export type XCastFilterType = "xpath_exists" | "property";

/** One X-Cast branch condition. */
export interface XCastCondition {
  readonly filterType: XCastFilterType;
  readonly expression: string;
  readonly expectedValue: string;
}

/** The final routing decision an X-Cast branch resolves to. */
export type XCastRoutingType = "JMS" | "ProcessDirect" | "Terminate";

/** A terminal X-Cast node: the resolved routing output. */
export interface XCastOutput {
  readonly nodeType: "output";
  readonly routingType: XCastRoutingType;
  /** Queue name (JMS), ProcessDirect address, or unused (Terminate). */
  readonly target: string;
}

/** A conditional X-Cast node ("if"/"else if") — evaluates first, then either branches into `then` or falls through to `next`. */
export interface XCastConditionNode {
  readonly nodeType: "condition";
  readonly conditionType: "if" | "elseIf";
  readonly condition: XCastCondition;
  /** Executed when the condition matches; may itself be a nested condition (arbitrary nesting). */
  readonly then: XCastNode;
  /** The next branch in the if/else-if/else chain (another `elseIf`, a terminal `else`, or none). */
  readonly next: XCastBranchNode | undefined;
}

/** The unconditional terminal branch of an if/else-if chain (spec: "Add Fallback"). */
export interface XCastElseNode {
  readonly nodeType: "else";
  readonly then: XCastNode;
}

export type XCastBranchNode = XCastConditionNode | XCastElseNode;
export type XCastNode = XCastBranchNode | XCastOutput;

/** An X-Cast Endpoint Resolver rule (spec — nested condition tree resolving a routing output). */
export interface XCastRule {
  readonly kind: "xcast";
  readonly root: XCastConditionNode;
}

/** A rule is either kind, discriminated by `kind`. */
export type Rule = RuleSetRule | XCastRule;

/** One row in a rule listing — enough to render without decoding every rule's full content. */
export interface RuleSummary {
  readonly pid: string;
  readonly id: string;
  /** `undefined` when the stored content isn't recognized JSON (surfaced, never hidden). */
  readonly kind: "ruleset" | "xcast" | undefined;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** The parameters under one Partner ID, decoded to summaries. */
export interface RuleListDto {
  readonly pid: string;
  readonly rules: readonly RuleSummary[];
}

/** The save payload for `PUT /api/v1/coe-rule-builder`. */
export interface RuleSaveRequest {
  readonly pid: string;
  readonly id: string;
  readonly rule: Rule;
}
