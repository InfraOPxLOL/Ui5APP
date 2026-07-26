import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import {
  blankXCastRoot,
  type EditorMode,
  type EditorState,
  type RuleKind,
  type XCastRowView,
} from "../../model/coeRuleBuilder/RuleEditorState";
import type {
  IdentifyingQuery,
  MutableXCastBranchNode,
  MutableXCastConditionNode,
  MutableXCastNode,
  Rule,
} from "../../service/coeRuleBuilder/RuleBuilderTypes";

/** Where a node sits in its parent — used by the structural X-Cast tree edits to splice/replace it. */
interface NodeLocation {
  readonly isRoot: boolean;
  readonly parent: MutableXCastBranchNode | undefined;
  readonly key: "then" | "next" | undefined;
}

/**
 * Shared base controller hosting the CoE rule editor (Agreement Ruleset / X-Cast Endpoint Resolver).
 * It owns **all** the editor's field/structural logic, operating on a fixed `view>/ruleEditor` slice
 * ({@link EditorState}) and driving the shared `RuleEditorContent` fragment. Two hosts extend it:
 * - `RuleBuilderController` — the standalone Visual Rule Builder (editor inside a dialog);
 * - `CreationFlowController` — the route-creation wizards (editor as an inline "Disambiguation Rule"
 *   step), so all three wizards inherit the editor for free.
 *
 * Save orchestration is deliberately **not** here — each host saves differently (the Rule Builder's
 * dialog Save vs. the wizard's Deploy) — but they share {@link buildRule}/{@link validateVisualRule}.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRuleBuilder
 */
export default abstract class RuleEditorHostController extends BaseController {
  /** Mirrors the backend `PID_PATTERN` (`coe-rule-builder/validators.ts`) — Partner Directory PID charset. */
  protected static readonly PID_PATTERN = /^[A-Za-z0-9_.]+$/;

  // --- Kind / mode switches -----------------------------------------------------------

  /** Switches the rule kind (new rules only — an existing rule's kind is fixed). */
  public onKindChange(event: Event): void {
    const model = this.model();
    const kind = RuleEditorHostController.selectedItemKey(event) as RuleKind | undefined;
    if (kind === undefined) {
      return;
    }
    model.setProperty("/ruleEditor/kind", kind);
    if (kind === "xcast") {
      model.setProperty("/ruleEditor/xcast/root", blankXCastRoot());
      this.refreshXCastRows();
    }
  }

  /** Switches between the Visual and Raw JSON editor modes, syncing content in the direction switched. */
  public onModeChange(event: Event): void {
    const model = this.model();
    const mode = RuleEditorHostController.selectedItemKey(event) as EditorMode | undefined;
    if (mode === undefined) {
      return;
    }
    const editor = model.getProperty("/ruleEditor") as EditorState;
    if (mode === "raw") {
      model.setProperty(
        "/ruleEditor/rawJson",
        JSON.stringify(RuleEditorHostController.buildRule(editor), null, 2),
      );
      model.setProperty("/ruleEditor/rawError", "");
      model.setProperty("/ruleEditor/mode", "raw");
      return;
    }
    // Switching back to Visual: the hand-edited JSON must parse and match the editor's rule kind.
    try {
      const parsed = JSON.parse(editor.rawJson) as Rule;
      if (parsed.kind !== editor.kind) {
        throw new Error(this.getText("coeRuleBuilder.raw.kindMismatch", [editor.kind]));
      }
      RuleEditorHostController.applyRuleToEditor(editor, parsed);
      model.setProperty("/ruleEditor", editor);
      model.setProperty("/ruleEditor/mode", "visual");
      this.refreshXCastRows();
    } catch (error) {
      model.setProperty(
        "/ruleEditor/rawError",
        error instanceof Error ? error.message : this.getText("coeRuleBuilder.raw.invalidJson"),
      );
    }
  }

  // --- Ruleset editor -----------------------------------------------------------------

  /** Adds a blank identifying query row. */
  public onAddQuery(): void {
    const model = this.model();
    const queries = [
      ...(model.getProperty("/ruleEditor/ruleset/identifyingQueries") as IdentifyingQuery[]),
      { type: "property", expression: "", expectedValue: "" } as IdentifyingQuery,
    ];
    model.setProperty("/ruleEditor/ruleset/identifyingQueries", queries);
  }

  /** Removes one identifying query row. */
  public onRemoveQuery(event: Event): void {
    const model = this.model();
    const query = this.rowObject<IdentifyingQuery>(event);
    const queries = (
      model.getProperty("/ruleEditor/ruleset/identifyingQueries") as IdentifyingQuery[]
    ).filter((candidate) => candidate !== query);
    model.setProperty(
      "/ruleEditor/ruleset/identifyingQueries",
      queries.length > 0 ? queries : [{ type: "property", expression: "", expectedValue: "" }],
    );
  }

  // --- X-Cast editor: structural tree edits -------------------------------------------

  /** Appends a blank "else if" branch after this condition node (only when it has none yet). */
  public onAddElseIf(event: Event): void {
    this.mutateBranch(event, (node) => {
      if (node.nodeType !== "condition" || node.next !== undefined) {
        return;
      }
      node.next = {
        nodeType: "condition",
        conditionType: "elseIf",
        condition: { filterType: "property", expression: "", expectedValue: "" },
        then: { nodeType: "output", routingType: "Terminate", target: "" },
        next: undefined,
      };
    });
  }

  /** Appends a terminal "else" fallback branch after this condition node (spec: "Add Fallback"). */
  public onAddElse(event: Event): void {
    this.mutateBranch(event, (node) => {
      if (node.nodeType !== "condition" || node.next !== undefined) {
        return;
      }
      node.next = {
        nodeType: "else",
        then: { nodeType: "output", routingType: "Terminate", target: "" },
      };
    });
  }

  /** Removes this branch from the chain, splicing whatever followed it back in (never the root "if"). */
  public onRemoveBranch(event: Event): void {
    const model = this.model();
    const node = this.rowNode<MutableXCastNode>(event);
    if (node === undefined) {
      return;
    }
    const root = model.getProperty("/ruleEditor/xcast/root") as MutableXCastConditionNode;
    const location = RuleEditorHostController.locate(root, node);
    if (
      location.isRoot ||
      location.parent === undefined ||
      location.parent.nodeType !== "condition" ||
      location.key !== "next"
    ) {
      return;
    }
    location.parent.next = node.nodeType === "condition" ? node.next : undefined;
    this.refreshXCastRows();
  }

  /** Turns a branch's `then` slot into a routing output (the common case). */
  public onThenAsOutput(event: Event): void {
    this.mutateBranch(event, (node) => {
      node.then = { nodeType: "output", routingType: "Terminate", target: "" };
    });
  }

  /** Turns a branch's `then` slot into a nested condition (arbitrary sub-branching, per spec). */
  public onThenAsCondition(event: Event): void {
    this.mutateBranch(event, (node) => {
      node.then = {
        nodeType: "condition",
        conditionType: "if",
        condition: { filterType: "property", expression: "", expectedValue: "" },
        then: { nodeType: "output", routingType: "Terminate", target: "" },
        next: undefined,
      };
    });
  }

  private mutateBranch(event: Event, mutate: (node: MutableXCastBranchNode) => void): void {
    const node = this.rowNode<MutableXCastBranchNode>(event);
    if (node === undefined) {
      return;
    }
    mutate(node);
    this.refreshXCastRows();
  }

  /** Rebuilds `/ruleEditor/xcast/rows` from the current tree (call after every structural mutation). */
  protected refreshXCastRows(): void {
    const model = this.model();
    const root = model.getProperty("/ruleEditor/xcast/root") as MutableXCastConditionNode;
    model.setProperty("/ruleEditor/xcast/rows", RuleEditorHostController.flatten(root, 0, "root"));
  }

  /**
   * Flattens the if/else-if/else chain into display rows: siblings at one depth, `then` nested one
   * deeper. `role` tracks how each node was reached, so the view can gate "Remove" to only the
   * optional `.next` continuations (never the mandatory root "if" or a branch's mandatory `.then`).
   */
  private static flatten(
    node: MutableXCastNode | undefined,
    depth: number,
    role: "root" | "chain" | "then",
  ): XCastRowView[] {
    if (node === undefined) {
      return [];
    }
    const row: XCastRowView = { depth, node, isRoot: role === "root", canRemove: role === "chain" };
    if (node.nodeType === "output") {
      return [row];
    }
    const rows: XCastRowView[] = [
      row,
      ...RuleEditorHostController.flatten(node.then, depth + 1, "then"),
    ];
    if (node.nodeType === "condition") {
      rows.push(...RuleEditorHostController.flatten(node.next, depth, "chain"));
    }
    return rows;
  }

  /**
   * Locates a node's parent + the key it's reachable through, or reports it as the (unremovable) root.
   * The target may sit under any branch node's `then` (condition *or* else) at any depth, or in a
   * condition node's `next` chain — so the walk covers both `nodeType`s uniformly.
   */
  private static locate(root: MutableXCastConditionNode, target: MutableXCastNode): NodeLocation {
    if ((root as MutableXCastNode) === target) {
      return { isRoot: true, parent: undefined, key: undefined };
    }
    const walk = (node: MutableXCastBranchNode): NodeLocation | undefined => {
      if (node.then === target) {
        return { isRoot: false, parent: node, key: "then" };
      }
      if (node.nodeType === "condition" && node.next === target) {
        return { isRoot: false, parent: node, key: "next" };
      }
      if (node.then.nodeType !== "output") {
        const inThen = walk(node.then);
        if (inThen !== undefined) {
          return inThen;
        }
      }
      if (node.nodeType === "condition" && node.next !== undefined) {
        return walk(node.next);
      }
      return undefined;
    };
    return walk(root) ?? { isRoot: false, parent: undefined, key: undefined };
  }

  // --- Build / validate / apply (shared by both hosts' save paths) --------------------

  /** The current editor working state at `view>/ruleEditor`. */
  protected currentEditor(): EditorState {
    return this.model().getProperty("/ruleEditor") as EditorState;
  }

  /** Builds the `Rule` payload from the current visual-mode editor state (convenience for step hosts). */
  protected buildCurrentRule(): Rule {
    return RuleEditorHostController.buildRule(this.currentEditor());
  }

  /**
   * Resolves the `Rule` to persist from the current editor, or a specific problem message to show —
   * shared save-gate for step hosts (the wizards). Handles the rule-name check, raw-JSON parsing, and
   * visual-mode field validation identically to the standalone Rule Builder's own Save.
   */
  protected resolveRuleForSave(): { readonly rule?: Rule; readonly problem?: string } {
    const editor = this.currentEditor();
    if (editor.id.trim() === "") {
      return { problem: this.getText("coeRuleBuilder.save.idRequired") };
    }
    if (editor.mode === "raw") {
      try {
        return { rule: JSON.parse(editor.rawJson) as Rule };
      } catch {
        return { problem: this.getText("coeRuleBuilder.raw.invalidJson") };
      }
    }
    const problem = this.validateVisualRule(editor);
    return problem !== undefined ? { problem } : { rule: RuleEditorHostController.buildRule(editor) };
  }

  /** Builds the `Rule` payload from the editor's current visual-mode fields. */
  protected static buildRule(editor: EditorState): Rule {
    if (editor.kind === "ruleset") {
      return {
        kind: "ruleset",
        ruleName: editor.id.trim(),
        identifyingQueries: editor.ruleset.identifyingQueries,
        targetRouting: editor.ruleset.targetRouting,
      };
    }
    return { kind: "xcast", root: editor.xcast.root };
  }

  /** Populates the editor's visual fields from a decoded rule (edit-load or raw→visual sync). */
  protected static applyRuleToEditor(editor: EditorState, rule: Rule): void {
    if (rule.kind === "ruleset") {
      editor.ruleset = {
        identifyingQueries: [...rule.identifyingQueries],
        targetRouting: { ...rule.targetRouting },
      };
    } else {
      // A freshly decoded/parsed rule owns its own object graph (never aliased elsewhere), so treating
      // it as the tree editor's mutable working copy is safe — `readonly` here is a wire-contract
      // concern, not a runtime one.
      editor.xcast = { root: rule.root as MutableXCastConditionNode, rows: [] };
    }
  }

  /**
   * Validates the visual-mode editor against exactly the constraints the backend's `ruleSaveSchema`
   * enforces, returning a specific, human-readable message for the first violation (or `undefined`
   * when valid). Deliberately mirrors — never exceeds — the server rules, so it can never block a
   * save the backend would accept, nor pass one it would reject.
   */
  protected validateVisualRule(editor: EditorState): string | undefined {
    if (editor.kind === "ruleset") {
      const ruleset = editor.ruleset;
      if (ruleset.identifyingQueries.some((query) => query.expression.trim() === "")) {
        return this.getText("coeRuleBuilder.save.queryExpressionRequired");
      }
      if (!RuleEditorHostController.PID_PATTERN.test(ruleset.targetRouting.targetPid.trim())) {
        return this.getText("coeRuleBuilder.save.targetPidRequired");
      }
      if (ruleset.targetRouting.routeKey.trim() === "") {
        return this.getText("coeRuleBuilder.save.routeKeyRequired");
      }
      return undefined;
    }
    return RuleEditorHostController.hasMissingXCastExpression(editor.xcast.root)
      ? this.getText("coeRuleBuilder.save.xcastConditionRequired")
      : undefined;
  }

  /** Whether any condition node anywhere in the X-Cast tree has an empty `expression` (backend `min(1)`). */
  private static hasMissingXCastExpression(node: MutableXCastNode): boolean {
    if (node.nodeType === "output") {
      return false;
    }
    if (node.nodeType === "condition" && node.condition.expression.trim() === "") {
      return true;
    }
    if (RuleEditorHostController.hasMissingXCastExpression(node.then)) {
      return true;
    }
    return node.nodeType === "condition" && node.next !== undefined
      ? RuleEditorHostController.hasMissingXCastExpression(node.next)
      : false;
  }

  // --- Shared event helpers -----------------------------------------------------------

  /** Extracts the pressed item's `key` from a `sap.m.SegmentedButton` `selectionChange` event. */
  private static selectedItemKey(event: Event): string | undefined {
    const item = event.getParameter("item" as never) as { getKey?: () => string } | undefined;
    return item?.getKey?.();
  }

  /** Resolves the `view`-model object bound to the row/control that fired the event. */
  protected rowObject<T>(event: Event): T | undefined {
    const source = event.getSource() as { getBindingContext?: (model: string) => unknown };
    const context = source.getBindingContext?.("view") as { getObject: () => T } | null | undefined;
    return context?.getObject();
  }

  /**
   * Resolves the *live* X-Cast tree node behind the row that fired the event. The X-Cast list binds
   * to flattened {@link XCastRowView} wrappers, so the row's binding context is the wrapper — every
   * structural edit must reach through its `node` to mutate the real tree (the field bindings already
   * do this via `{view>node/…}`; the button handlers must too).
   */
  protected rowNode<T>(event: Event): T | undefined {
    return this.rowObject<XCastRowView>(event)?.node as T | undefined;
  }

  /** The owning view's `view` JSONModel (holds the `/ruleEditor` slice among the host's own state). */
  protected model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
