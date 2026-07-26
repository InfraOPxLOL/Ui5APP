import type {
  IdentifyingQuery,
  MutableXCastConditionNode,
  MutableXCastNode,
} from "../../service/coeRuleBuilder/RuleBuilderTypes";

/**
 * The rule-editor's working state and blank-state factories — shared by the standalone CoE Visual
 * Rule Builder and by the route-creation wizards' "Disambiguation Rule" step, both of which host the
 * same editor via {@link module:controller/coeRuleBuilder/RuleEditorHost.RuleEditorHostController}
 * bound to a `view>/ruleEditor` slice. Kept separate from `RuleBuilderModel` so a wizard model can
 * embed the editor state without pulling in the Rule Builder's own list/search model.
 */

/** The Agreement Ruleset editor's working state (spec — flat array: queries + target routing). */
export interface RulesetEditorState {
  identifyingQueries: IdentifyingQuery[];
  targetRouting: { targetPid: string; routeKey: string };
}

/**
 * One row in the flattened X-Cast tree display — `node` is the *live* object from `root`'s chain, so
 * two-way field bindings (`{view>/ruleEditor/xcast/rows/0/node/condition/expression}`) mutate the
 * tree in place; only structural edits (add/remove/convert) need explicit controller methods.
 */
export interface XCastRowView {
  readonly depth: number;
  readonly node: MutableXCastNode;
  /** The root "if" — never removable. */
  readonly isRoot: boolean;
  /** Reached via a `.next` pointer (an elseIf/else continuation) — the only rows removable in place. */
  readonly canRemove: boolean;
}

/** The X-Cast Endpoint Resolver editor's working state (spec — nested if/else-if/else condition tree). */
export interface XCastEditorState {
  root: MutableXCastConditionNode;
  rows: XCastRowView[];
}

export type RuleKind = "ruleset" | "xcast";
export type EditorMode = "visual" | "raw";

/** The rule editor's full working state (dialog/step visibility is controlled imperatively, not via binding). */
export interface EditorState {
  isNew: boolean;
  pid: string;
  id: string;
  kind: RuleKind;
  mode: EditorMode;
  rawJson: string;
  rawError: string;
  ruleset: RulesetEditorState;
  xcast: XCastEditorState;
}

/** A blank X-Cast root: a single "if" condition with a default Terminate output. */
export function blankXCastRoot(): MutableXCastConditionNode {
  return {
    nodeType: "condition",
    conditionType: "if",
    condition: { filterType: "property", expression: "", expectedValue: "" },
    then: { nodeType: "output", routingType: "Terminate", target: "" },
    next: undefined,
  };
}

/** A blank editor state for a new rule under the given registry PID (defaults to the Agreement Ruleset kind). */
export function blankEditor(pid: string): EditorState {
  return {
    isNew: true,
    pid,
    id: "",
    kind: "ruleset",
    mode: "visual",
    rawJson: "",
    rawError: "",
    ruleset: {
      identifyingQueries: [{ type: "property", expression: "", expectedValue: "" }],
      targetRouting: { targetPid: "", routeKey: "" },
    },
    xcast: { root: blankXCastRoot(), rows: [] },
  };
}
