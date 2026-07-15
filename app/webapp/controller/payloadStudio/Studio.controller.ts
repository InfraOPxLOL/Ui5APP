import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import ClipboardUtils from "../../core/utils/ClipboardUtils";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import TextSearchUtils from "../../core/utils/TextSearchUtils";
import UserContext from "../../shell/context/UserContext";
import PayloadStudioService from "../../service/payloadStudio/PayloadStudioService";
import PayloadCompareUtils from "../../service/payloadStudio/PayloadCompareUtils";
import PayloadStatisticsUtils from "../../service/payloadStudio/PayloadStatisticsUtils";
import PayloadValidationUtils from "../../service/payloadStudio/PayloadValidationUtils";
import PayloadLayoutService from "../../service/payloadStudio/PayloadLayoutService";
import PayloadStudioFormatter from "../../formatter/payloadStudio/PayloadStudioFormatter";
import PayloadStudioModel from "../../model/payloadStudio/PayloadStudioModel";
import {
  PAYLOAD_NAV_ITEMS,
  type PayloadNavTarget,
} from "../../config/payloadStudio/payloadNavigation";
import {
  PAYLOAD_QUICK_ACTIONS,
  type PayloadQuickActionDefinition,
} from "../../config/payloadStudio/payloadQuickActions";
import type {
  PayloadStudioData,
  PayloadView,
  PayloadViewMode,
} from "../../service/payloadStudio/PayloadStudioTypes";

/** The color themes exposed by the theme toggle (§ Payload Editor). */
const LIGHT_THEME = "textmate";
const DARK_THEME = "tomorrow_night";

/**
 * Controller for Payload Studio (Phase 10) — a professional payload investigation environment,
 * always opened from the Message Investigation Workspace.
 *
 * Consumes **only** `/api/v1/payload-studio` (itself composed entirely from the Operations Engine);
 * it never talks to the SDK, never knows an Integration Suite endpoint. It owns the icon-driven
 * Payload Navigation, the editor (pretty/raw/tree, word wrap, theme, fullscreen), search statistics,
 * request/response comparison, the metadata panel, headers/properties/attachments/validation, the
 * metadata-driven quick-action framework, and context navigation back to Message Investigation,
 * Runtime and Queue.
 *
 * @namespace com.middlewareops.integrationportal.controller.payloadStudio
 */
export default class StudioController extends BaseController {
  /** Exposed for formatter bindings in the view. */
  public readonly formatter = PayloadStudioFormatter;

  /** Maps a retry-status classification to a UI5 value state (binding-facing delegate). */
  public formatRetryStatusState(retryStatus: string): string {
    return PayloadStudioFormatter.retryStatusState(retryStatus);
  }

  /** Maps a payload source to a UI5 value state (binding-facing delegate). */
  public formatPayloadSourceState(payloadSource: string): string {
    return PayloadStudioFormatter.payloadSourceState(payloadSource);
  }

  /** Maps a validation issue severity to a UI5 value state (binding-facing delegate). */
  public formatValidationSeverityState(severity: string): string {
    return PayloadStudioFormatter.validationSeverityState(severity);
  }

  /** Maps a diff line kind to an indication name (binding-facing delegate). */
  public formatDiffLineState(kind: string): string {
    return PayloadStudioFormatter.diffLineState(kind);
  }

  /** Maps a payload format to a representative icon (binding-facing delegate). */
  public formatIcon(format: string): string {
    return PayloadStudioFormatter.formatIcon(format);
  }

  private readonly service = new PayloadStudioService();
  private readonly layoutService = PayloadLayoutService.getInstance();
  private loadAbort: AbortController | undefined;

  /** Lifecycle hook: reads the deep-linked message id, restores layout, loads the studio payload. */
  public onInit(): void {
    this.setModel(new PayloadStudioModel(), "view");
    this.model().setProperty(
      "/nav",
      PAYLOAD_NAV_ITEMS.map((item) => ({ ...item, title: this.getText(item.titleKey) })),
    );
    this.model().setProperty("/quickActions", this.buildQuickActionsViewModel());
    this.applyLayout();

    this.getRouter()
      .getRoute("payloadStudio")
      ?.attachPatternMatched((event: Event) => this.onRouteMatched(event));
  }

  /** Lifecycle hook: aborts any in-flight load. */
  public onExit(): void {
    this.loadAbort?.abort();
  }

  private onRouteMatched(event: Event): void {
    const args = event.getParameter("arguments" as never) as { "?query"?: Record<string, string> };
    const token = args["?query"]?.state;
    const state = DeepLinkHelper.decode<{ messageId?: string }>(token);
    if (state?.messageId !== undefined && state.messageId !== "") {
      void this.loadStudio(state.messageId);
    }
  }

  private async loadStudio(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/messageId", messageId);
    model.setProperty("/busy", true);
    this.loadAbort?.abort();
    this.loadAbort = new AbortController();
    try {
      const data = await this.service.getStudio(messageId, this.loadAbort.signal);
      model.setProperty("/data", data);
      model.setProperty("/comparison/result", null);
      this.recomputeDerivedState();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /** Manual refresh. */
  public onRefreshPress(): void {
    const messageId = this.model().getProperty("/messageId") as string;
    if (messageId !== "") {
      void this.loadStudio(messageId);
    }
  }

  // --- Payload Navigation (§ Payload Navigation) --------------------------------

  /** Selects a Payload Navigation item — either an editor slot or a bottom/metadata focus target. */
  public onNavItemPress(event: Event): void {
    const item = StudioController.contextOf<{
      id: PayloadNavTarget;
      editorSlot: boolean;
      future?: boolean;
    }>(event);
    if (item === undefined || item.future === true) {
      if (item?.future === true) {
        MessageToast.show(this.getText("payloadStudio.future"));
      }
      return;
    }
    if (item.editorSlot) {
      this.model().setProperty("/editor/activeTarget", item.id);
      if (item.id === "comparison") {
        this.onCompare();
      } else {
        this.recomputeDerivedState();
      }
    } else {
      this.model().setProperty("/layout/bottomTab", item.id);
      this.model().setProperty("/layout/bottomPanelExpanded", true);
      this.persistLayout();
    }
  }

  private recomputeDerivedState(): void {
    const payload = this.activePayload();
    if (payload === undefined) {
      this.model().setProperty("/statistics", null);
      this.model().setProperty("/validation", null);
      this.model().setProperty("/editor/displayText", "");
      this.model().setProperty("/editor/displayFormat", "text");
      this.model().setProperty("/editor/displayIsBinary", false);
      return;
    }
    this.model().setProperty(
      "/statistics",
      PayloadStatisticsUtils.compute(payload.raw, payload.format, payload.tree),
    );
    this.model().setProperty(
      "/validation",
      PayloadValidationUtils.validate(payload.raw, payload.format),
    );
    this.updateDisplayText(payload);
    this.applySearch();
  }

  private updateDisplayText(payload: PayloadView): void {
    this.model().setProperty("/editor/displayText", this.currentEditorText(payload));
    this.model().setProperty(
      "/editor/displayFormat",
      payload.format === "binary" ? "text" : payload.format,
    );
    this.model().setProperty("/editor/displayIsBinary", payload.format === "binary");
  }

  private activePayload(): PayloadView | undefined {
    const data = this.model().getProperty("/data") as PayloadStudioData | null;
    const target = this.model().getProperty("/editor/activeTarget") as PayloadNavTarget;
    if (data === null) {
      return undefined;
    }
    return target === "response" ? data.responsePayload : data.requestPayload;
  }

  // --- Editor chrome (§ Payload Editor) -----------------------------------------

  /** Switches the editor's rendering mode. */
  public onViewModeChange(event: Event): void {
    const key = (event.getParameter("key" as never) as PayloadViewMode | undefined) ?? "pretty";
    this.model().setProperty("/editor/viewMode", key);
    const payload = this.activePayload();
    if (payload !== undefined) {
      this.updateDisplayText(payload);
    }
  }

  /** Toggles word wrap. */
  public onWordWrapToggle(): void {
    const wrap = !(this.model().getProperty("/editor/wordWrap") as boolean);
    this.model().setProperty("/editor/wordWrap", wrap);
  }

  /** Toggles fullscreen presentation of the editor pane. */
  public onFullscreenToggle(): void {
    const fullscreen = !(this.model().getProperty("/editor/fullscreen") as boolean);
    this.model().setProperty("/editor/fullscreen", fullscreen);
  }

  /** Toggles the editor's light/dark colour theme. */
  public onThemeToggle(): void {
    const current = this.model().getProperty("/editor/colorTheme") as string;
    this.model().setProperty(
      "/editor/colorTheme",
      current === LIGHT_THEME ? DARK_THEME : LIGHT_THEME,
    );
  }

  // --- Search (§ Search) ---------------------------------------------------------

  /** Re-runs the search over the currently displayed payload text. */
  public onSearchExecute(): void {
    this.applySearch();
  }

  /** Toggles a search option and re-runs the search. */
  public onSearchOptionToggle(): void {
    this.applySearch();
  }

  private applySearch(): void {
    const model = this.model();
    const query = model.getProperty("/search/query") as string;
    const payload = this.activePayload();
    if (payload === undefined || query === "") {
      model.setProperty("/search/matchCount", 0);
      model.setProperty("/search/activeMatchIndex", -1);
      return;
    }
    const text = this.currentEditorText(payload);
    const result = TextSearchUtils.findMatches(text, query, {
      caseSensitive: model.getProperty("/search/caseSensitive") as boolean,
      wholeWord: model.getProperty("/search/wholeWord") as boolean,
      regex: model.getProperty("/search/regex") as boolean,
    });
    model.setProperty("/search/matchCount", result.count);
    model.setProperty("/search/activeMatchIndex", result.count > 0 ? 0 : -1);
  }

  /** Advances to the next match (statistics only — see the module README on native Ctrl+F navigation). */
  public onFindNext(): void {
    const count = this.model().getProperty("/search/matchCount") as number;
    if (count === 0) {
      return;
    }
    const current = this.model().getProperty("/search/activeMatchIndex") as number;
    this.model().setProperty("/search/activeMatchIndex", (current + 1) % count);
  }

  /** Goes back to the previous match. */
  public onFindPrevious(): void {
    const count = this.model().getProperty("/search/matchCount") as number;
    if (count === 0) {
      return;
    }
    const current = this.model().getProperty("/search/activeMatchIndex") as number;
    this.model().setProperty("/search/activeMatchIndex", (current - 1 + count) % count);
  }

  private currentEditorText(payload: PayloadView): string {
    const mode = this.model().getProperty("/editor/viewMode") as PayloadViewMode;
    if (mode === "raw") {
      return payload.raw;
    }
    if (mode === "tree" && payload.tree !== undefined) {
      return JSON.stringify(payload.tree, null, 2);
    }
    return payload.formatted;
  }

  // --- Comparison (§ Request/Response Comparison) ------------------------------

  /** Computes (or recomputes) the request/response comparison. */
  public onCompare(): void {
    const data = this.model().getProperty("/data") as PayloadStudioData | null;
    if (data === null || data.requestPayload === undefined || data.responsePayload === undefined) {
      this.model().setProperty("/comparison/result", null);
      return;
    }
    const result = PayloadCompareUtils.compare(
      data.requestPayload.formatted,
      data.responsePayload.formatted,
      {
        ignoreWhitespace: this.model().getProperty("/comparison/ignoreWhitespace") as boolean,
      },
    );
    this.model().setProperty("/comparison/result", result);
  }

  /** Toggles "ignore whitespace" and recomputes the comparison. */
  public onIgnoreWhitespaceToggle(): void {
    const ignore = !(this.model().getProperty("/comparison/ignoreWhitespace") as boolean);
    this.model().setProperty("/comparison/ignoreWhitespace", ignore);
    this.onCompare();
  }

  // --- Layout persistence (§ Layout) --------------------------------------------

  /** Toggles the Payload Navigation panel's collapsed state. */
  public onToggleNavPanel(): void {
    const collapsed = !(this.model().getProperty("/layout/navCollapsed") as boolean);
    this.model().setProperty("/layout/navCollapsed", collapsed);
    this.persistLayout();
  }

  /** Toggles the Metadata Panel's collapsed state. */
  public onToggleMetadataPanel(): void {
    const collapsed = !(this.model().getProperty("/layout/metadataCollapsed") as boolean);
    this.model().setProperty("/layout/metadataCollapsed", collapsed);
    this.persistLayout();
  }

  /** Toggles the bottom panel's expanded state. */
  public onToggleBottomPanel(): void {
    const expanded = !(this.model().getProperty("/layout/bottomPanelExpanded") as boolean);
    this.model().setProperty("/layout/bottomPanelExpanded", expanded);
    this.persistLayout();
  }

  /** Selects a bottom-panel tab. */
  public onBottomTabSelect(event: Event): void {
    const key = (event.getParameter("key" as never) as string | undefined) ?? "properties";
    this.model().setProperty("/layout/bottomTab", key);
    this.persistLayout();
  }

  private applyLayout(): void {
    const snapshot = this.layoutService.getSnapshot();
    this.model().setProperty("/layout", { ...snapshot });
  }

  private persistLayout(): void {
    const layout = this.model().getProperty("/layout") as {
      navCollapsed: boolean;
      metadataCollapsed: boolean;
      bottomPanelExpanded: boolean;
      bottomTab: string;
    };
    this.layoutService.update(layout);
  }

  // --- Quick actions (§ Quick Actions) -------------------------------------------

  private buildQuickActionsViewModel(): readonly { id: string; title: string; icon: string }[] {
    const engine = UserContext.getInstance().getPermissionEngine();
    return PAYLOAD_QUICK_ACTIONS.filter((action) => engine.isSatisfied(action.permission)).map(
      (action) => ({ id: action.id, title: this.getText(action.titleKey), icon: action.icon }),
    );
  }

  /** Dispatches a quick action. */
  public onQuickActionPress(event: Event): void {
    const id = StudioController.contextOf<{ id: string }>(event)?.id;
    const action = PAYLOAD_QUICK_ACTIONS.find((candidate) => candidate.id === id);
    if (action !== undefined) {
      void this.dispatchQuickAction(action);
    }
  }

  private async dispatchQuickAction(action: PayloadQuickActionDefinition): Promise<void> {
    switch (action.kind) {
      case "copy":
        await this.copyForAction(action);
        break;
      case "download":
        await this.downloadActivePayload();
        break;
      case "navigate":
        this.navigateForAction(action);
        break;
      case "compare":
        this.model().setProperty("/editor/activeTarget", "comparison");
        this.onCompare();
        break;
      case "future":
        MessageToast.show(this.getText("payloadStudio.future"));
        break;
    }
  }

  private async copyForAction(action: PayloadQuickActionDefinition): Promise<void> {
    const data = this.model().getProperty("/data") as PayloadStudioData | null;
    if (data === null) {
      return;
    }
    let text = "";
    if (action.copyField === "payload") {
      text = this.activePayload()?.formatted ?? "";
    } else if (action.copyField === "metadata") {
      text = JSON.stringify(data.metadata, null, 2);
    } else if (action.copyField === "headers") {
      text = JSON.stringify(data.headers, null, 2);
    }
    const succeeded = await ClipboardUtils.copyText(text);
    MessageToast.show(
      this.getText(succeeded ? "payloadStudio.copy.success" : "payloadStudio.copy.failure"),
    );
  }

  private async downloadActivePayload(): Promise<void> {
    const payload = this.activePayload();
    const messageId = this.model().getProperty("/messageId") as string;
    if (payload === undefined) {
      return;
    }
    await this.service.downloadAttachment(messageId, payload.attachmentId, payload.name);
  }

  private navigateForAction(action: PayloadQuickActionDefinition): void {
    if (action.route === undefined) {
      return;
    }
    if (action.route === "messageMonitoring") {
      const messageId = this.model().getProperty("/messageId") as string;
      this.getRouter().navTo("messageMonitoring", {
        "?query": { state: DeepLinkHelper.encode({ messageId }) },
      });
      return;
    }
    this.navTo(action.route);
  }

  // --- Helpers -------------------------------------------------------------------

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private static contextOf<T>(event: Event): T | undefined {
    const source = event.getSource() as unknown as {
      getBindingContext(model?: string): { getObject(): unknown } | null | undefined;
    };
    return (
      (source.getBindingContext("view")?.getObject() as T | undefined) ??
      (source.getBindingContext()?.getObject() as T | undefined)
    );
  }
}
