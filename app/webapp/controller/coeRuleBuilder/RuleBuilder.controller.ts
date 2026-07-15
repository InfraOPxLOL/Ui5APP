import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import RuleBuilderService from "../../service/coeRuleBuilder/RuleBuilderService";
import RuleBuilderModel, {
  blankXCastRoot,
  type EditorState,
  type RuleKind,
  type XCastRowView,
} from "../../model/coeRuleBuilder/RuleBuilderModel";
import type {
  IdentifyingQuery,
  MutableXCastBranchNode,
  MutableXCastConditionNode,
  MutableXCastNode,
  Rule,
  RuleSummary,
} from "../../service/coeRuleBuilder/RuleBuilderTypes";

/** Where a node sits in its parent — used by the structural X-Cast tree edits to splice/replace it. */
interface NodeLocation {
  readonly isRoot: boolean;
  readonly parent: MutableXCastBranchNode | undefined;
  readonly key: "then" | "next" | undefined;
}

/**
 * Controller for the CoE Visual Rule Builder workspace — authors the rule content a
 * `RULESET_.{SNDPRN}.{RCVPRN}` entry references (the Visual Rule Builder / Binary Parameters phase
 * deferred from the original CoE framework message). Two rule kinds share one editor shell:
 * - **Agreement Ruleset**: a flat identifying-query list + target routing.
 * - **X-Cast Endpoint Resolver**: a nested if/else-if/else condition chain resolving a routing output.
 *
 * A Visual/Raw JSON toggle lets either kind be authored as structured fields or as hand-edited JSON.
 * Consumes **only** `/api/v1/coe-rule-builder`; it never talks to the SDK or knows the binary-parameter
 * storage detail (base64 encoding is entirely a backend concern).
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRuleBuilder
 */
export default class RuleBuilderController extends BaseController {
  private readonly service = new RuleBuilderService();
  private loadAbort: AbortController | undefined;
  private dialog: Dialog | undefined;

  /** Lifecycle hook: installs the view model and listens for deep-link navigation (pid + rule name). */
  public onInit(): void {
    this.setModel(new RuleBuilderModel(), "view");
    this.getRouter()
      .getRoute("coeRuleBuilder")
      ?.attachPatternMatched((event: Event) => this.onRouteMatched(event));
  }

  /**
   * Handles a deep link from a route wizard's ruleset-escalation warning (spec follow-up — see
   * `coeRouter`'s `RulesetFollowUp`): searches the linked registry PID, then opens the linked rule for
   * editing if it already exists, or a blank editor with its name pre-filled if it doesn't yet.
   */
  private onRouteMatched(event: Event): void {
    const args = event.getParameter("arguments" as never) as { "?query"?: Record<string, string> };
    const state = DeepLinkHelper.decode<{ pid?: string; ruleName?: string }>(args["?query"]?.state);
    if (state?.pid === undefined || state.pid === "") {
      return;
    }
    void this.openEditorForRuleName(state.pid, state.ruleName);
  }

  /** Searches `pid`, then opens `ruleName` for editing if found, or a blank editor pre-filled with it. */
  private async openEditorForRuleName(pid: string, ruleName: string | undefined): Promise<void> {
    const model = this.model();
    model.setProperty("/pid", pid);
    await this.onSearch();
    const rules = model.getProperty("/rules") as RuleSummary[];
    const existing = rules.find((rule) => rule.id === ruleName && rule.kind !== undefined);
    if (existing !== undefined) {
      await this.loadRuleIntoEditor(existing);
      return;
    }
    await this.onNewRule();
    if (ruleName !== undefined && ruleName !== "") {
      model.setProperty("/editor/id", ruleName);
    }
  }

  /** Lifecycle hook: aborts any in-flight list/get request and destroys the cached editor dialog. */
  public onExit(): void {
    this.loadAbort?.abort();
    this.dialog?.destroy();
  }

  // --- Browse ----------------------------------------------------------------------

  /** Lists the rules under the entered registry PID. */
  public async onSearch(): Promise<void> {
    const model = this.model();
    const pid = (model.getProperty("/pid") as string).trim();
    if (pid === "") {
      MessageToast.show(this.getText("coeRuleBuilder.search.pidRequired"));
      return;
    }
    model.setProperty("/busy", true);
    this.loadAbort?.abort();
    this.loadAbort = new AbortController();
    try {
      const list = await this.service.list(pid, this.loadAbort.signal);
      model.setProperty("/rules", list.rules);
    } catch (error) {
      if (!this.loadAbort.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!this.loadAbort.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  // --- Editor: open / close ----------------------------------------------------------

  /** Opens the editor for a new rule under the currently searched PID. */
  public async onNewRule(): Promise<void> {
    const model = this.model();
    const pid = (model.getProperty("/pid") as string).trim();
    if (pid === "") {
      MessageToast.show(this.getText("coeRuleBuilder.search.pidRequired"));
      return;
    }
    model.setProperty("/editor", RuleBuilderController.blankEditor(pid));
    this.refreshXCastRows();
    (await this.getEditorDialog()).open();
  }

  /** Opens the editor for an existing rule (row press). */
  public async onEditRule(event: Event): Promise<void> {
    const summary = this.rowObject<RuleSummary>(event);
    if (summary === undefined || summary.kind === undefined) {
      MessageToast.show(this.getText("coeRuleBuilder.edit.unrecognized"));
      return;
    }
    await this.loadRuleIntoEditor(summary);
  }

  private async loadRuleIntoEditor(summary: RuleSummary): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const rule = await this.service.get(summary.pid, summary.id);
      const editor = RuleBuilderController.blankEditor(summary.pid);
      editor.isNew = false;
      editor.id = summary.id;
      editor.kind = rule.kind;
      RuleBuilderController.applyRuleToEditor(editor, rule);
      model.setProperty("/editor", editor);
      this.refreshXCastRows();
      (await this.getEditorDialog()).open();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /** Closes the editor without saving. */
  public onCloseEditor(): void {
    this.dialog?.close();
  }

  /** Deletes a rule (row press), after confirmation. */
  public onDeleteRule(event: Event): void {
    const summary = this.rowObject<RuleSummary>(event);
    if (summary === undefined) {
      return;
    }
    MessageBox.confirm(this.getText("coeRuleBuilder.delete.confirm.text", [summary.id]), {
      title: this.getText("coeRuleBuilder.delete.confirm.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.deleteRule(summary);
        }
      },
    });
  }

  private async deleteRule(summary: RuleSummary): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      await this.service.remove(summary.pid, summary.id);
      MessageToast.show(this.getText("coeRuleBuilder.delete.success"));
      await this.onSearch();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  // --- Editor: kind / mode switches ---------------------------------------------------

  /** Switches the rule kind (new rules only — an existing rule's kind is fixed). */
  public onKindChange(event: Event): void {
    const model = this.model();
    const kind = this.selectedItemKey(event) as RuleKind | undefined;
    if (kind === undefined) {
      return;
    }
    model.setProperty("/editor/kind", kind);
    if (kind === "xcast") {
      model.setProperty("/editor/xcast/root", blankXCastRoot());
      this.refreshXCastRows();
    }
  }

  /** Switches between the Visual and Raw JSON editor modes, syncing content in the direction switched. */
  public onModeChange(event: Event): void {
    const model = this.model();
    const mode = this.selectedItemKey(event) as "visual" | "raw" | undefined;
    if (mode === undefined) {
      return;
    }
    const editor = model.getProperty("/editor") as EditorState;
    if (mode === "raw") {
      model.setProperty(
        "/editor/rawJson",
        JSON.stringify(RuleBuilderController.buildRule(editor), null, 2),
      );
      model.setProperty("/editor/rawError", "");
      model.setProperty("/editor/mode", "raw");
      return;
    }
    // Switching back to Visual: the hand-edited JSON must parse and match the editor's rule kind.
    try {
      const parsed = JSON.parse(editor.rawJson) as Rule;
      if (parsed.kind !== editor.kind) {
        throw new Error(this.getText("coeRuleBuilder.raw.kindMismatch", [editor.kind]));
      }
      RuleBuilderController.applyRuleToEditor(editor, parsed);
      model.setProperty("/editor", editor);
      model.setProperty("/editor/mode", "visual");
      this.refreshXCastRows();
    } catch (error) {
      model.setProperty(
        "/editor/rawError",
        error instanceof Error ? error.message : this.getText("coeRuleBuilder.raw.invalidJson"),
      );
    }
  }

  // --- Ruleset editor ------------------------------------------------------------------

  /** Adds a blank identifying query row. */
  public onAddQuery(): void {
    const model = this.model();
    const queries = [
      ...(model.getProperty("/editor/ruleset/identifyingQueries") as IdentifyingQuery[]),
      { type: "property", expression: "", expectedValue: "" } as IdentifyingQuery,
    ];
    model.setProperty("/editor/ruleset/identifyingQueries", queries);
  }

  /** Removes one identifying query row. */
  public onRemoveQuery(event: Event): void {
    const model = this.model();
    const query = this.rowObject<IdentifyingQuery>(event);
    const queries = (
      model.getProperty("/editor/ruleset/identifyingQueries") as IdentifyingQuery[]
    ).filter((candidate) => candidate !== query);
    model.setProperty(
      "/editor/ruleset/identifyingQueries",
      queries.length > 0 ? queries : [{ type: "property", expression: "", expectedValue: "" }],
    );
  }

  // --- X-Cast editor: structural tree edits ---------------------------------------------

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
    const node = this.rowObject<MutableXCastNode>(event);
    if (node === undefined) {
      return;
    }
    const root = model.getProperty("/editor/xcast/root") as MutableXCastConditionNode;
    const location = RuleBuilderController.locate(root, node);
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
    const node = this.rowObject<MutableXCastBranchNode>(event);
    if (node === undefined) {
      return;
    }
    mutate(node);
    this.refreshXCastRows();
  }

  /** Rebuilds `/editor/xcast/rows` from the current tree (call after every structural mutation). */
  private refreshXCastRows(): void {
    const model = this.model();
    const root = model.getProperty("/editor/xcast/root") as MutableXCastConditionNode;
    model.setProperty("/editor/xcast/rows", RuleBuilderController.flatten(root, 0, "root"));
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
      ...RuleBuilderController.flatten(node.then, depth + 1, "then"),
    ];
    if (node.nodeType === "condition") {
      rows.push(...RuleBuilderController.flatten(node.next, depth, "chain"));
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

  // --- Save ------------------------------------------------------------------------------

  /** Validates (raw mode) and saves the rule. */
  public async onSave(): Promise<void> {
    const model = this.model();
    const editor = model.getProperty("/editor") as EditorState;
    if (editor.id.trim() === "") {
      MessageToast.show(this.getText("coeRuleBuilder.save.idRequired"));
      return;
    }
    let rule: Rule;
    if (editor.mode === "raw") {
      try {
        rule = JSON.parse(editor.rawJson) as Rule;
      } catch {
        model.setProperty("/editor/rawError", this.getText("coeRuleBuilder.raw.invalidJson"));
        return;
      }
    } else {
      rule = RuleBuilderController.buildRule(editor);
    }
    model.setProperty("/busy", true);
    try {
      await this.service.save({ pid: editor.pid, id: editor.id.trim(), rule });
      MessageToast.show(this.getText("coeRuleBuilder.save.success"));
      this.dialog?.close();
      await this.onSearch();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  // --- Shared helpers ----------------------------------------------------------------------

  private static blankEditor(pid: string): EditorState {
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

  /** Populates the editor's visual fields from a decoded rule (edit-load or raw→visual sync). */
  private static applyRuleToEditor(editor: EditorState, rule: Rule): void {
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

  /** Builds the `Rule` payload from the editor's current visual-mode fields. */
  private static buildRule(editor: EditorState): Rule {
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

  /** Extracts the pressed item's `key` from a `sap.m.SegmentedButton` `selectionChange` event. */
  private selectedItemKey(event: Event): string | undefined {
    const item = event.getParameter("item" as never) as { getKey?: () => string } | undefined;
    return item?.getKey?.();
  }

  /** Resolves the `view`-model object bound to the row/control that fired the event. */
  private rowObject<T>(event: Event): T | undefined {
    const source = event.getSource() as { getBindingContext?: (model: string) => unknown };
    const context = source.getBindingContext?.("view") as { getObject: () => T } | null | undefined;
    return context?.getObject();
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  /** Lazily loads (once) and caches the editor dialog fragment, bound via inherited `view` model. */
  private async getEditorDialog(): Promise<Dialog> {
    if (this.dialog === undefined) {
      this.dialog = (await Fragment.load({
        name: "com.middlewareops.integrationportal.view.coeRuleBuilder.RuleEditor",
        controller: this,
      })) as Dialog;
      this.getView()?.addDependent(this.dialog);
    }
    return this.dialog;
  }
}
