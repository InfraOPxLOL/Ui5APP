import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  IdentifyingQuery,
  MutableXCastConditionNode,
  MutableXCastNode,
  RuleSummary,
} from "../../service/coeRuleBuilder/RuleBuilderTypes";

/** The Agreement Ruleset editor's working state (spec — flat array: queries + target routing). */
export interface RulesetEditorState {
  identifyingQueries: IdentifyingQuery[];
  targetRouting: { targetPid: string; routeKey: string };
}

/** One row in the flattened X-Cast tree display — `node` is the *live* object from `root`'s chain, so
 * two-way field bindings (`{view>/editor/xcast/rows/0/node/condition/expression}`) mutate the tree in
 * place; only structural edits (add/remove/convert) need explicit controller methods. */
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

/** The rule editor dialog's full working state (dialog visibility is controlled imperatively, not via binding). */
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

/** Shape of the CoE Visual Rule Builder view model. */
export interface RuleBuilderState {
  busy: boolean;
  pid: string;
  rules: RuleSummary[];
  editor: EditorState;
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

/**
 * The single view model for the CoE Visual Rule Builder workspace (architecture §15). Owned by the
 * controller and exposed under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRuleBuilder
 */
export default class RuleBuilderModel extends JSONModel {
  public constructor() {
    const initial: RuleBuilderState = {
      busy: false,
      pid: "",
      rules: [],
      editor: {
        isNew: true,
        pid: "",
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
      },
    };
    super(initial);
  }
}
