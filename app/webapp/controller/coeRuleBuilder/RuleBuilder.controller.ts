import RuleEditorHostController from "./RuleEditorHost.controller";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import RuleBuilderService from "../../service/coeRuleBuilder/RuleBuilderService";
import { blankEditor, type EditorState } from "../../model/coeRuleBuilder/RuleEditorState";
import RuleBuilderModel from "../../model/coeRuleBuilder/RuleBuilderModel";
import type { Rule, RuleSummary } from "../../service/coeRuleBuilder/RuleBuilderTypes";

/**
 * Controller for the standalone CoE Visual Rule Builder workspace — authors the rule content a
 * `RULESET_.{SNDPRN}.{RCVPRN}` entry references. It owns only the browse/search/CRUD shell and the
 * editor **dialog**; the editor's own field/structural logic (both rule kinds, Visual/Raw toggle)
 * lives in the shared {@link RuleEditorHostController} it extends — the same host the route-creation
 * wizards use to embed the editor as a step. Editor state lives at `view>/ruleEditor`.
 *
 * Consumes **only** `/api/v1/coe-rule-builder`; it never talks to the SDK or knows the binary-parameter
 * storage detail (base64 encoding is entirely a backend concern).
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRuleBuilder
 */
export default class RuleBuilderController extends RuleEditorHostController {
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
      model.setProperty("/ruleEditor/id", ruleName);
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
    model.setProperty("/ruleEditor", blankEditor(pid));
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
      const editor = blankEditor(summary.pid);
      editor.isNew = false;
      editor.id = summary.id;
      editor.kind = rule.kind;
      RuleEditorHostController.applyRuleToEditor(editor, rule);
      model.setProperty("/ruleEditor", editor);
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

  // --- Save ------------------------------------------------------------------------------

  /** Validates (raw mode) and saves the rule, then closes the dialog and reloads the list. */
  public async onSave(): Promise<void> {
    const model = this.model();
    const editor = model.getProperty("/ruleEditor") as EditorState;
    if (editor.id.trim() === "") {
      MessageToast.show(this.getText("coeRuleBuilder.save.idRequired"));
      return;
    }
    let rule: Rule;
    if (editor.mode === "raw") {
      try {
        rule = JSON.parse(editor.rawJson) as Rule;
      } catch {
        model.setProperty("/ruleEditor/rawError", this.getText("coeRuleBuilder.raw.invalidJson"));
        return;
      }
    } else {
      const problem = this.validateVisualRule(editor);
      if (problem !== undefined) {
        MessageToast.show(problem);
        return;
      }
      rule = RuleEditorHostController.buildRule(editor);
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
