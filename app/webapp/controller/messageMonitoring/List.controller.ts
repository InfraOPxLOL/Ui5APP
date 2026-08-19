import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Fragment from "sap/ui/core/Fragment";
import Menu from "sap/m/Menu";
import MenuItem from "sap/m/MenuItem";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Select from "sap/m/Select";
import Text from "sap/m/Text";
import CoreItem from "sap/ui/core/Item";
import type Event from "sap/ui/base/Event";
import InvestigationGrid from "../../library/controls/InvestigationGrid";
import ClipboardUtils from "../../core/utils/ClipboardUtils";
import DownloadUtils from "../../core/utils/DownloadUtils";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import { FileTypes, type FileTypeKey } from "../../core/constants/FileTypes";
import UserContext from "../../shell/context/UserContext";
import { RoleCollections } from "../../shell/permissions/RoleCollections";
import MessageMonitoringService from "../../service/messageMonitoring/MessageMonitoringService";
import BookmarkService from "../../service/messageMonitoring/BookmarkService";
import SavedSearchService from "../../service/messageMonitoring/SavedSearchService";
import GridLayoutService from "../../service/messageMonitoring/GridLayoutService";
import PanelLayoutService from "../../service/messageMonitoring/PanelLayoutService";
import JmsQueueService from "../../service/jmsQueue/JmsQueueService";
import PayloadStudioService from "../../service/payloadStudio/PayloadStudioService";
import { appendDetailCrumb, removeDetailCrumb, type BreadcrumbEntry } from "./DetailBreadcrumb";
import { formatPathBlock, formatPathSummary, toPlanRows } from "./RecoveryPathFormatter";
import MessageMonitoringFormatter from "../../formatter/messageMonitoring/MessageMonitoringFormatter";
import MessageMonitoringModel from "../../model/messageMonitoring/MessageMonitoringModel";
import { messageInvestigationTableConfig } from "../../config/messageMonitoring/columns";
import { SMART_FILTERS } from "../../config/messageMonitoring/smartFilters";
import {
  INVESTIGATION_ACTIONS,
  type InvestigationActionDefinition,
} from "../../config/messageMonitoring/investigationActions";
import type {
  MessageExportFormat,
  MessageMonitoringItem,
  MessageRecoveryOutcome,
  MessageSearchCriteria,
  ProcessingFramework,
  RecoveryState,
  SmartFilter,
} from "../../service/messageMonitoring/MessageInvestigationTypes";

/**
 * The framework filter's options, in the order they appear. `""` is "all frameworks"; the rest
 * mirror the backend's `ProcessingFramework` union exactly.
 */
const FRAMEWORK_FILTER_KEYS: readonly (ProcessingFramework | "")[] = [
  "",
  "TPM_V2",
  "JMS_FRAMEWORK",
  "COMMON_IDOC_ROUTER",
  "IDOC_STATUS_SYNC",
  "NON_FRAMEWORK",
  "UNKNOWN",
];

/**
 * The recovery-state filter's options. A deliberate subset of the full `RecoveryState` union: the
 * states that only ever arise *during* or *after* an execution (`RETRYING`, `COMPLETED`,
 * `FAILED_AGAIN`) are not useful list filters, since the list carries the indicative pre-execution
 * value.
 */
const RECOVERY_STATE_FILTER_KEYS: readonly (RecoveryState | "")[] = [
  "",
  "RECOVERABLE",
  "MANUAL_INVESTIGATION_REQUIRED",
  "UNSUPPORTED",
];

/** Maps an export format to the shared {@link FileTypes} registry key (extension + MIME type). */
const EXPORT_FILE_TYPE: Readonly<Record<MessageExportFormat, FileTypeKey>> = {
  csv: "Csv",
  json: "Json",
  xml: "Xml",
  excel: "Excel",
};

/**
 * Controller for the Message Investigation Workspace (Phase 9) — the operational investigation tool
 * middleware engineers spend most of their day in.
 *
 * Consumes **only** the Message Investigation Workspace's backend module
 * (`/api/v1/message-monitoring`, itself composed entirely from the Operations Engine); it never
 * talks to the SDK, never knows an Integration Suite endpoint, and only ever handles Operations DTOs.
 * Owns: the investigation grid (search/sort/group/pin/layout), the Advanced Search Panel's criteria,
 * the Context Panel (selection-driven), the Detail Drawer (tabs, lazily loaded), the metadata-driven
 * action framework, context navigation, bookmarks/saved searches (session-only), and bulk/CSV export
 * via the Operations Engine's Export Engine.
 *
 * @namespace com.middlewareops.integrationportal.controller.messageMonitoring
 */
export default class ListController extends BaseController {
  /** Exposed for formatter bindings in the view. */
  public readonly formatter = MessageMonitoringFormatter;

  /** Maps a health status to a UI5 value state (binding-facing delegate, see fragments). */
  public formatHealthState(health: string): string {
    return MessageMonitoringFormatter.healthState(health);
  }

  /** Maps a severity to a UI5 value state (binding-facing delegate, see fragments). */
  public formatSeverityState(severity: string): string {
    return MessageMonitoringFormatter.severityState(severity);
  }

  /** Maps a health status to an icon (binding-facing delegate, see fragments). */
  public formatHealthIcon(health: string): string {
    return MessageMonitoringFormatter.healthIcon(health);
  }

  /** Maps a retry-status classification to a UI5 value state (binding-facing delegate). */
  public formatRetryStatusState(retryStatus: string): string {
    return MessageMonitoringFormatter.retryStatusState(retryStatus);
  }

  /** Formats an ISO timestamp relative to now (binding-facing delegate). */
  public formatRelative(value: string | undefined): string {
    return value === undefined ? "" : MessageMonitoringFormatter.relative(value);
  }

  /** Maps a recovery state to a UI5 value state (binding-facing delegate). */
  public formatRecoveryStateState(state: string | undefined): string {
    return state === undefined ? "None" : MessageMonitoringFormatter.recoveryStateState(state as never);
  }

  /** Maps a recovery state to an icon (binding-facing delegate). */
  public formatRecoveryStateIcon(state: string | undefined): string {
    return state === undefined ? "" : MessageMonitoringFormatter.recoveryStateIcon(state as never);
  }

  /** Maps a detection confidence to a UI5 value state (binding-facing delegate). */
  public formatConfidenceState(confidence: string | undefined): string {
    return confidence === undefined ? "None" : MessageMonitoringFormatter.confidenceState(confidence);
  }

  private readonly service = new MessageMonitoringService();
  private readonly bookmarks = BookmarkService.getInstance();
  private readonly savedSearches = SavedSearchService.getInstance();
  private readonly gridLayouts = GridLayoutService.getInstance();
  private readonly panelLayout = PanelLayoutService.getInstance();
  private grid!: InvestigationGrid;
  private rowMenu: Menu | undefined;
  private listAbort: AbortController | undefined;
  private contextAbort: AbortController | undefined;
  private detailAbort: AbortController | undefined;

  /** Lifecycle hook: wires the grid, context menu, deep-link handling and loads the first page. */
  public onInit(): void {
    this.setModel(new MessageMonitoringModel(), "view");
    this.grid = this.byId("grid") as unknown as InvestigationGrid;
    this.grid.applyConfiguration(
      messageInvestigationTableConfig,
      (key) => this.getText(key),
      "view",
    );
    this.grid.bindRowsTo("/items", "view");
    this.grid.attachRowSelectionChange(() => this.onRowSelectionChanged());
    this.grid.onRowDoubleClick((context) => this.onRowActivated(context));
    this.grid.setContextMenu(this.buildRowMenu());

    this.model().setProperty("/bookmarkedIds", [...this.bookmarks.getAll()]);
    this.model().setProperty(
      "/smartFilters",
      SMART_FILTERS.map((filter) => ({ ...filter, title: this.getText(filter.titleKey) })),
    );
    this.model().setProperty("/savedSearches", [...this.savedSearches.getAll()]);
    this.model().setProperty("/savedLayouts", [...this.gridLayouts.getAll()]);
    this.model().setProperty("/actions", this.buildActionsViewModel());
    this.model().setProperty("/canRetry", this.hasRole(RoleCollections.RetryOperator));
    this.buildFilterOptions();
    this.applyPanelLayout();
    this.getRouter()
      .getRoute("messageMonitoring")
      ?.attachPatternMatched((event: Event) => this.onRouteMatched(event));

    void this.refresh();
  }

  /** Lifecycle hook: aborts in-flight requests and destroys owned controls. */
  public onExit(): void {
    this.listAbort?.abort();
    this.contextAbort?.abort();
    this.detailAbort?.abort();
    this.rowMenu?.destroy();
    this.recoveryPlanDialog?.destroy();
  }

  // --- Data loading ----------------------------------------------------------

  private onRouteMatched(event: Event): void {
    const args = event.getParameter("arguments" as never) as {
      mplId?: string;
      "?query"?: Record<string, string>;
    };
    if (args.mplId !== undefined && args.mplId !== "") {
      void this.enterDetailPage(args.mplId);
      return;
    }
    if (this.model().getProperty("/detailPageOpen") as boolean) {
      this.leaveDetailPage();
    }
    const token = args["?query"]?.state;
    const state = DeepLinkHelper.decode<{ messageId?: string }>(token);
    if (state?.messageId !== undefined && state.messageId !== "") {
      void this.selectMessageById(state.messageId);
    }
  }

  /** Reloads the grid from the current criteria/grid state, managing the busy state. */
  public async refresh(): Promise<void> {
    const model = this.model();
    model.setProperty("/grid/busy", true);
    this.listAbort?.abort();
    this.listAbort = new AbortController();
    try {
      const criteria = model.getProperty("/criteria") as MessageSearchCriteria;
      const grid = model.getProperty("/grid") as {
        page: number;
        pageSize: number;
        sortBy: string;
        sortDirection: "asc" | "desc";
      };
      const page = await this.service.list(
        criteria,
        grid.page,
        grid.pageSize,
        grid.sortBy,
        grid.sortDirection,
        this.listAbort.signal,
      );
      model.setProperty("/items", [...page.items]);
      model.setProperty("/total", page.total);
      model.setProperty("/selectedMessageIds", []);
      // No post-load classification pass here any more: framework and recovery state arrive on every
      // row from the backend, and both filters are applied server-side before pagination.
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/grid/busy", false);
    }
  }

  /** Toolbar refresh action. */
  public onRefreshPress(): void {
    void this.refresh();
  }

  // --- Advanced Search Panel ---------------------------------------------------

  /** Executes the current Advanced Search Panel criteria (§ Advanced Search). */
  public onSearchExecute(): void {
    this.model().setProperty("/grid/page", 1);
    this.model().setProperty("/activeSmartFilter", "");
    void this.refresh();
  }

  /** Clears all Advanced Search Panel criteria. */
  public onSearchClear(): void {
    this.model().setProperty("/criteria", {});
    this.model().setProperty("/activeSmartFilter", "");
    this.model().setProperty("/grid/page", 1);
    void this.refresh();
  }

  /** Applies a smart filter preset (§ Smart Filters). */
  public onSmartFilterPress(event: Event): void {
    const id = ListController.dataOf(
      event.getSource() as unknown as object,
      "smartFilter",
    ) as SmartFilter;
    this.model().setProperty("/criteria", { smartFilter: id });
    this.model().setProperty("/activeSmartFilter", id);
    this.model().setProperty("/grid/page", 1);
    void this.refresh();
  }

  /** Saves the current criteria as a named search (§ Saved Searches). */
  public onSaveSearch(): void {
    const name = (this.model().getProperty("/newSavedSearchName") as string | undefined)?.trim();
    if (name === undefined || name === "") {
      return;
    }
    this.savedSearches.save(name, this.model().getProperty("/criteria") as MessageSearchCriteria);
    this.model().setProperty("/savedSearches", [...this.savedSearches.getAll()]);
    this.model().setProperty("/newSavedSearchName", "");
    MessageToast.show(this.getText("investigation.search.saved", [name]));
  }

  /**
   * Loads a saved search's criteria and re-runs it. Driven by the compact saved-search `Select`, so
   * the id comes from the selected item's key (not a row binding context).
   */
  public onLoadSavedSearch(event: Event): void {
    const item = event.getParameter("selectedItem" as never) as
      | { getKey(): string }
      | undefined
      | null;
    const id = item?.getKey();
    const saved = id === undefined || id === "" ? undefined : this.savedSearches.get(id);
    if (saved === undefined) {
      return;
    }
    this.model().setProperty("/criteria", { ...saved.criteria });
    this.model().setProperty("/activeSmartFilter", saved.criteria.smartFilter ?? "");
    this.model().setProperty("/grid/page", 1);
    void this.refresh();
  }

  /** Deletes the saved search currently chosen in the saved-search `Select`. */
  public onDeleteSavedSearch(): void {
    const id = this.model().getProperty("/selectedSavedSearchId") as string;
    if (id === "") {
      return;
    }
    this.savedSearches.remove(id);
    this.model().setProperty("/savedSearches", [...this.savedSearches.getAll()]);
    this.model().setProperty("/selectedSavedSearchId", "");
  }

  // --- Row selection / Context Panel -------------------------------------------

  private onRowSelectionChanged(): void {
    const items = this.model().getProperty("/items") as MessageMonitoringItem[];
    const selectedIds = this.grid
      .getSelectedIndices()
      .map((rowIndex) => items[rowIndex]?.messageId)
      .filter((id): id is string => id !== undefined);
    this.model().setProperty("/selectedMessageIds", selectedIds);

    const index = this.grid.getSelectedIndex();
    const item = index >= 0 ? items[index] : undefined;
    this.model().setProperty("/selectedMessageId", item?.messageId ?? "");
    if (item !== undefined) {
      void this.loadContext(item.messageId);
    }
  }

  private async selectMessageById(messageId: string): Promise<void> {
    this.model().setProperty("/selectedMessageId", messageId);
    await this.loadContext(messageId);
    this.model().setProperty("/drawer/expanded", true);
    await this.loadDetail(messageId);
  }

  private async loadContext(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/context/busy", true);
    this.contextAbort?.abort();
    this.contextAbort = new AbortController();
    try {
      const [context, related] = await Promise.all([
        this.service.getContext(messageId, this.contextAbort.signal),
        this.service.getRelated(messageId, this.contextAbort.signal),
      ]);
      model.setProperty("/context/context", context);
      model.setProperty("/context/related", [...related]);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/context/busy", false);
    }
  }

  /** Opens a related message: selects it and reloads the Context Panel/Detail Drawer for it. */
  public onOpenRelatedMessage(event: Event): void {
    const related = ListController.contextOf<MessageMonitoringItem>(event);
    if (related !== undefined) {
      void this.selectMessageById(related.messageId);
    }
  }

  private onRowActivated(context: object | undefined): void {
    const item = context as MessageMonitoringItem | undefined;
    if (item === undefined) {
      return;
    }
    this.model().setProperty("/selectedMessageId", item.messageId);
    this.model().setProperty("/drawer/expanded", true);
    void this.loadContext(item.messageId);
    void this.loadDetail(item.messageId);
  }

  // --- Detail Drawer -----------------------------------------------------------

  /** Toggles the Detail Drawer; loads the detail lazily on first expand. */
  public onDrawerToggle(): void {
    const model = this.model();
    const expanded = !(model.getProperty("/drawer/expanded") as boolean);
    model.setProperty("/drawer/expanded", expanded);
    const messageId = model.getProperty("/selectedMessageId") as string;
    if (expanded && messageId !== "" && model.getProperty("/drawer/detail") === null) {
      void this.loadDetail(messageId);
    }
  }

  /**
   * Selects a Detail Drawer tab; lazily resolves the recovery plan on first visit to the Recovery
   * tab. Deferred rather than loaded with the message because the plan really probes queues — a cost
   * worth paying only when the operator asks to see it.
   */
  public onDrawerTabSelect(event: Event): void {
    const key = (event.getParameter("key" as never) as string | undefined) ?? "overview";
    this.model().setProperty("/drawer/activeTab", key);
    if (key === "recovery" && !(this.model().getProperty("/recovery/loaded") as boolean)) {
      const messageId = this.model().getProperty("/selectedMessageId") as string;
      if (messageId !== "") {
        void this.loadRecoveryPlan(messageId);
      }
    }
  }

  // --- Framework-aware recovery (§7, §8) ------------------------------------------

  /**
   * Loads the selected message's recovery plan for the Recovery tab. Read-only — resolving a plan
   * never moves or retries anything, so this is safe to run on tab selection.
   */
  private async loadRecoveryPlan(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/recovery/busy", true);
    try {
      const plan = await this.service.getRecoveryPlan(messageId);
      model.setProperty("/recovery", {
        busy: false,
        loaded: true,
        plan,
        pathBlock: formatPathBlock(plan.path),
        outcome: null,
      });
    } catch (error) {
      model.setProperty("/recovery/busy", false);
      this.getErrorHandler().handle(error);
    }
  }

  /** Recover button inside the Detail Drawer's Recovery tab. */
  public onRecoverFromDrawerPress(): void {
    const messageId = this.model().getProperty("/selectedMessageId") as string;
    if (messageId !== "") {
      void this.startRecoveryFlow(messageId);
    }
  }

  /**
   * Starts the single-message recovery confirm flow.
   *
   * The plan is re-resolved here rather than reusing whatever the Recovery tab last showed: that
   * value may be minutes old, and the message may have moved, drained or been recovered by someone
   * else since. Confirming against a stale plan is how an operator ends up authorising an action
   * against a queue the message has already left.
   */
  private async startRecoveryFlow(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/grid/busy", true);
    let plan;
    try {
      plan = await this.service.getRecoveryPlan(messageId);
    } catch (error) {
      this.getErrorHandler().handle(error);
      return;
    } finally {
      model.setProperty("/grid/busy", false);
    }

    // A JMS-framework message whose queue header could not be parsed is the one case where the
    // backend legitimately cannot resolve a queue and asks the operator to choose.
    if (!plan.executable && plan.framework === "JMS_FRAMEWORK" && plan.currentQueue === undefined) {
      await this.openManualQueueDialog(messageId, undefined);
      return;
    }
    if (!plan.executable) {
      MessageToast.show(plan.explanation);
      return;
    }

    MessageBox.confirm(
      this.getText("investigation.recovery.confirm.text", [
        this.frameworkLabel(plan.framework),
        formatPathSummary(plan.path),
      ]),
      {
        title: this.getText("investigation.recovery.confirm.title"),
        onClose: (action: unknown) => {
          if (action === MessageBox.Action.OK) {
            void this.executeRecovery(messageId);
          }
        },
      },
    );
  }

  /**
   * Executes recovery for one message and reports exactly what the backend said happened.
   *
   * `accepted` is reported as "accepted", never as "succeeded": the tenant has taken the retry, but
   * whether the message then processes cleanly is only visible later in its processing log (§7 — the
   * frontend must not pretend a retry succeeded because a request was accepted).
   */
  private async executeRecovery(messageId: string, queueName?: string): Promise<void> {
    const model = this.model();
    model.setProperty("/grid/busy", true);
    try {
      const outcome = await this.service.recover(messageId, undefined, queueName);
      model.setProperty("/recovery/outcome", outcome);
      MessageToast.show(outcome.note);
      model.setProperty("/recovery/loaded", false);
      await this.refresh();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/grid/busy", false);
    }
  }

  private async openManualQueueDialog(messageId: string, suggested: string | undefined): Promise<void> {
    let queueNames: string[];
    try {
      const page = await new JmsQueueService().list({ top: 200 });
      queueNames = page.items.map((queue) => queue.queueName);
    } catch (error) {
      this.getErrorHandler().handle(error);
      return;
    }
    const select = new Select({
      width: "100%",
      selectedKey: suggested ?? "",
      items: queueNames.map((name) => new CoreItem({ key: name, text: name })),
    });
    const dialog: Dialog = new Dialog({
      title: this.getText("investigation.retry.manualQueue.title"),
      content: [new Text({ text: this.getText("investigation.retry.manualQueue.text") }), select],
      beginButton: new Button({
        text: this.getText("investigation.retry.manualQueue.confirm"),
        type: "Emphasized",
        press: () => {
          const queueName = select.getSelectedKey();
          dialog.close();
          if (queueName !== "") {
            void this.executeRecovery(messageId, queueName);
          }
        },
      }),
      endButton: new Button({ text: this.getText("action.cancel"), press: () => dialog.close() }),
      afterClose: () => dialog.destroy(),
    });
    this.getView()?.addDependent(dialog);
    dialog.open();
  }

  /**
   * Toolbar "Retry Selected" (§9) — resolves a recovery strategy for every selected message, shows
   * the resulting plan, and executes only after the operator confirms.
   *
   * Non-executable messages are shown in the plan rather than silently dropped: an operator who
   * selected 10 rows and sees 7 run needs to know which 3 did not and why.
   */
  public async onRetrySelectedPress(): Promise<void> {
    if (!this.hasRole(RoleCollections.RetryOperator)) {
      MessageToast.show(this.getText("investigation.retry.roleRequired"));
      return;
    }
    const selectedIds = this.model().getProperty("/selectedMessageIds") as string[];
    if (selectedIds.length === 0) {
      MessageToast.show(this.getText("investigation.retry.bulk.noSelection"));
      return;
    }

    const model = this.model();
    model.setProperty("/grid/busy", true);
    let batch;
    try {
      // One round trip for the whole selection, rather than one request per message.
      batch = await this.service.buildRecoveryPlan(selectedIds);
    } catch (error) {
      this.getErrorHandler().handle(error);
      return;
    } finally {
      model.setProperty("/grid/busy", false);
    }

    model.setProperty("/recoveryPlan", {
      busy: false,
      rows: toPlanRows(batch.plans),
      executableMessageIds: batch.executableMessageIds,
      executableCount: batch.executableCount,
      excludedCount: batch.excludedCount,
      results: [],
      summary: "",
      executed: false,
    });

    const dialog = await this.getRecoveryPlanDialog();
    dialog.open();
  }

  /** Confirms the Recovery Plan dialog and executes only the messages that can genuinely run. */
  public async onRecoveryPlanConfirm(): Promise<void> {
    const model = this.model();
    const messageIds = model.getProperty(
      "/recoveryPlan/executableMessageIds",
    ) as readonly string[];
    if (messageIds.length === 0) {
      MessageToast.show(this.getText("investigation.recovery.bulk.noneExecutable"));
      return;
    }

    model.setProperty("/recoveryPlan/busy", true);
    const results: MessageRecoveryOutcome[] = [];
    for (const messageId of messageIds) {
      try {
        results.push(await this.service.recover(messageId));
      } catch (error) {
        // One message's failure must not abandon the rest of the batch — record it and continue.
        results.push({
          messageId,
          framework: "UNKNOWN",
          status: "failed",
          recoveryState: "MANUAL_INVESTIGATION_REQUIRED",
          steps: [],
          note: error instanceof Error ? error.message : String(error),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
      }
    }

    // "Accepted" is counted separately from "succeeded" on purpose — see `executeRecovery`.
    const accepted = results.filter(
      (result) => result.status === "accepted" || result.status === "successful",
    ).length;
    let summary = this.getText("investigation.recovery.bulk.complete", [accepted, results.length]);
    const excluded = model.getProperty("/recoveryPlan/excludedCount") as number;
    if (excluded > 0) {
      summary += " " + this.getText("investigation.recovery.bulk.excluded", [excluded]);
    }

    model.setProperty("/recoveryPlan/busy", false);
    model.setProperty("/recoveryPlan/results", results);
    model.setProperty("/recoveryPlan/summary", summary);
    model.setProperty("/recoveryPlan/executed", true);
    await this.refresh();
  }

  private async getRecoveryPlanDialog(): Promise<Dialog> {
    if (this.recoveryPlanDialog === undefined) {
      this.recoveryPlanDialog = (await Fragment.load({
        name: "com.middlewareops.integrationportal.fragment.messageMonitoring.RecoveryPlanDialog",
        controller: this,
      })) as Dialog;
      this.getView()?.addDependent(this.recoveryPlanDialog);
    }
    return this.recoveryPlanDialog;
  }

  /** Closes the Recovery Plan dialog. */
  public onRecoveryPlanClose(): void {
    this.recoveryPlanDialog?.close();
  }

  // --- Framework / recovery-state filters (§1, §8) ---------------------------------

  /**
   * Applies the processing-framework filter.
   *
   * Unlike the JMS/Non-JMS toggle this replaces, the filter is a **server-side criterion**: the
   * backend classifies the whole working set before paginating, so filtering by framework returns a
   * correct total and a full result set. The old toggle could only post-filter the rows already
   * loaded, and had to issue one classification request per row to do it.
   */
  public onFrameworkFilterChange(event: Event): void {
    const key = ((event.getParameter("selectedItem" as never) as { getKey(): string } | undefined)
      ?.getKey() ?? "") as ProcessingFramework | "";
    this.model().setProperty("/frameworkFilter", key);
    this.applyCriteriaFilters();
  }

  /** Applies the recovery-condition filter — the axis independent of framework. */
  public onRecoveryStateFilterChange(event: Event): void {
    const key = ((event.getParameter("selectedItem" as never) as { getKey(): string } | undefined)
      ?.getKey() ?? "") as RecoveryState | "";
    this.model().setProperty("/recoveryStateFilter", key);
    this.applyCriteriaFilters();
  }

  /** Folds both filter selections into the search criteria and reloads from the backend. */
  private applyCriteriaFilters(): void {
    const model = this.model();
    const criteria = { ...(model.getProperty("/criteria") as MessageSearchCriteria) };
    const framework = model.getProperty("/frameworkFilter") as ProcessingFramework | "";
    const recoveryState = model.getProperty("/recoveryStateFilter") as RecoveryState | "";

    if (framework === "") {
      delete criteria.framework;
    } else {
      criteria.framework = framework;
    }
    if (recoveryState === "") {
      delete criteria.recoveryState;
    } else {
      criteria.recoveryState = recoveryState;
    }

    model.setProperty("/criteria", criteria);
    model.setProperty("/grid/page", 1);
    void this.refresh();
  }

  /** Builds the two filter dropdowns' options, resolving each key to its i18n label. */
  private buildFilterOptions(): void {
    this.model().setProperty(
      "/frameworkOptions",
      FRAMEWORK_FILTER_KEYS.map((key) => ({
        key,
        text: key === "" ? this.getText("investigation.framework.all") : this.frameworkLabel(key),
      })),
    );
    this.model().setProperty(
      "/recoveryStateOptions",
      RECOVERY_STATE_FILTER_KEYS.map((key) => ({
        key,
        text:
          key === ""
            ? this.getText("investigation.recoveryState.all")
            : this.recoveryStateLabel(key),
      })),
    );
  }

  /** Resolves a framework's display label (binding-facing delegate for the grid column). */
  public frameworkLabel(framework: string): string {
    return framework === "" ? "" : this.getText(`investigation.framework.${framework}`);
  }

  /** Resolves a recovery state's display label (binding-facing delegate for the grid column). */
  public recoveryStateLabel(state: string): string {
    return state === "" ? "" : this.getText(`investigation.recoveryState.${state}`);
  }

  // --- Download (§ Message Actions) ------------------------------------------------

  private async downloadForMessage(messageId: string): Promise<void> {
    const payloadService = new PayloadStudioService();
    try {
      const studio = await payloadService.getStudio(messageId);
      if (studio.attachments.length === 0) {
        MessageToast.show(this.getText("investigation.download.noAttachment"));
        return;
      }
      if (studio.attachments.length === 1) {
        const attachment = studio.attachments[0];
        if (attachment !== undefined) {
          await payloadService.downloadAttachment(
            messageId,
            attachment.attachmentId,
            attachment.name,
          );
        }
        return;
      }
      this.getRouter().navTo("payloadStudio", {
        "?query": { state: DeepLinkHelper.encode({ messageId }) },
      });
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  // --- Detail page (§ Message Table — "expand option", a dedicated routed page) ----

  private recoveryPlanDialog: Dialog | undefined;

  /** Navigates to the dedicated, bookmarkable detail page for a message. */
  private openExpandedDetail(messageId: string): void {
    this.getRouter().navTo("messageMonitoring", { mplId: messageId });
  }

  /** "Back to Messages" — returns from the detail page to the list. */
  public onBackToList(): void {
    this.getRouter().navTo("messageMonitoring");
  }

  private async enterDetailPage(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/detailPageOpen", true);
    model.setProperty("/drawer/expanded", true);
    model.setProperty("/selectedMessageId", messageId);
    await Promise.all([this.loadContext(messageId), this.loadDetail(messageId)]);
    this.pushDetailBreadcrumb(messageId);
  }

  private leaveDetailPage(): void {
    this.model().setProperty("/detailPageOpen", false);
    this.popDetailBreadcrumb();
  }

  /**
   * Appends a 4th, message-level breadcrumb segment (pure transform in {@link DetailBreadcrumb}) on
   * top of Shell's own Home ▸ Workspace ▸ Module trail. Only ever touches this module's own shell
   * breadcrumb array — no shared `ShellViewBuilder` change, so no other module is affected.
   */
  private pushDetailBreadcrumb(messageId: string): void {
    const shellModel = this.getModel("shell") as JSONModel | undefined;
    if (shellModel === undefined) {
      return;
    }
    const crumbs = (shellModel.getProperty("/breadcrumbs") as BreadcrumbEntry[]) ?? [];
    shellModel.setProperty("/breadcrumbs", appendDetailCrumb(crumbs, messageId));
  }

  private popDetailBreadcrumb(): void {
    const shellModel = this.getModel("shell") as JSONModel | undefined;
    if (shellModel === undefined) {
      return;
    }
    const crumbs = (shellModel.getProperty("/breadcrumbs") as BreadcrumbEntry[]) ?? [];
    const restored = removeDetailCrumb(crumbs);
    if (restored !== undefined) {
      shellModel.setProperty("/breadcrumbs", restored);
    }
  }

  private async loadDetail(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/drawer/busy", true);
    this.detailAbort?.abort();
    this.detailAbort = new AbortController();
    try {
      const detail = await this.service.getById(messageId, this.detailAbort.signal);
      model.setProperty("/drawer/detail", detail);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/drawer/busy", false);
    }
  }

  // --- Bookmarks ---------------------------------------------------------------

  /** Toggles the bookmark state of a message (§ Bookmarks). */
  public onToggleBookmark(event: Event): void {
    const item = ListController.contextOf<MessageMonitoringItem>(event);
    if (item === undefined) {
      return;
    }
    this.bookmarks.toggle(item.messageId);
    this.model().setProperty("/bookmarkedIds", [...this.bookmarks.getAll()]);
  }

  // --- Grid chrome: columns / grouping / density / pinning / layouts -----------

  /** Opens the Columns popover listing every column with a visibility toggle. */
  public async onColumnsButtonPress(event: Event): Promise<void> {
    const source = event.getSource() as unknown as import("sap/ui/core/Control").default;
    const popover = (await Fragment.load({
      name: "com.middlewareops.integrationportal.fragment.messageMonitoring.ColumnsPopover",
      controller: this,
    })) as unknown as {
      setModel(model: JSONModel, name?: string): void;
      openBy(source: object): void;
    };
    const columns = messageInvestigationTableConfig.columns.map((column) => ({
      property: column.property,
      label: this.getText(column.labelKey),
      visible: this.grid.isColumnVisible(column.property) ?? true,
    }));
    popover.setModel(new JSONModel({ columns }), "columns");
    popover.openBy(source);
  }

  /** Toggles a column's visibility from the Columns popover. */
  public onColumnVisibilityToggle(event: Event): void {
    const source = event.getSource() as unknown as {
      getBindingContext(model: string): { getObject(): unknown } | null | undefined;
    };
    const column = source.getBindingContext("columns")?.getObject() as
      | { property: string }
      | undefined;
    const state = event.getParameter("selected" as never) as boolean | undefined;
    if (column !== undefined && state !== undefined) {
      this.grid.setColumnVisible(column.property, state);
    }
  }

  /** Changes the grid's group-by column. */
  public onGroupByChange(event: Event): void {
    const key = (
      event.getParameter("selectedItem" as never) as { getKey(): string } | undefined
    )?.getKey();
    this.grid.setGroupByProperty(key === undefined || key === "" ? undefined : key);
    this.model().setProperty("/grid/groupByProperty", key ?? "");
  }

  /** Toggles the grid's density preset. */
  public onDensityChange(event: Event): void {
    // See `onToggleAdvancedSearch` — ToggleButton's press parameter is `pressed`, not `state`.
    const density = event.getParameter("pressed" as never) === true ? "cozy" : "compact";
    this.grid.setDensity(density);
    this.model().setProperty("/grid/density", density);
  }

  /** Saves the current column layout under a name (§ Saved Layouts). */
  public onSaveLayout(): void {
    const name = (this.model().getProperty("/newLayoutName") as string | undefined)?.trim();
    if (name === undefined || name === "") {
      return;
    }
    this.gridLayouts.save(name, this.grid.getLayoutSnapshot());
    this.model().setProperty("/savedLayouts", [...this.gridLayouts.getAll()]);
    this.model().setProperty("/newLayoutName", "");
    MessageToast.show(this.getText("investigation.layout.saved", [name]));
  }

  /** Applies a saved column layout. */
  public onLoadLayout(event: Event): void {
    const id = ListController.contextOf<{ id: string }>(event)?.id;
    const layout = id === undefined ? undefined : this.gridLayouts.get(id);
    if (layout !== undefined) {
      this.grid.applyLayoutSnapshot(layout.snapshot);
    }
  }

  // --- Actions framework (§ Message Actions) -----------------------------------

  private buildActionsViewModel(): readonly { id: string; title: string; icon: string }[] {
    const engine = UserContext.getInstance().getPermissionEngine();
    return INVESTIGATION_ACTIONS.filter((action) => engine.isSatisfied(action.permission)).map(
      (action) => ({ id: action.id, title: this.getText(action.titleKey), icon: action.icon }),
    );
  }

  /** Dispatches an action pressed from the Context Panel's action list (same metadata as the row context menu). */
  public onContextActionPress(event: Event): void {
    const id = ListController.contextOf<{ id: string }>(event)?.id;
    const action = INVESTIGATION_ACTIONS.find((candidate) => candidate.id === id);
    if (action !== undefined) {
      this.dispatchAction(action);
    }
  }

  private buildRowMenu(): Menu {
    const engine = UserContext.getInstance().getPermissionEngine();
    const menu = new Menu();
    for (const action of INVESTIGATION_ACTIONS) {
      if (!engine.isSatisfied(action.permission)) {
        continue;
      }
      const item = new MenuItem({
        text: this.getText(action.titleKey),
        icon: action.icon,
        press: () => this.dispatchAction(action),
      });
      menu.addItem(item);
    }
    this.rowMenu = menu;
    return menu;
  }

  private dispatchAction(action: InvestigationActionDefinition): void {
    const messageId = this.model().getProperty("/selectedMessageId") as string;
    if (messageId === "") {
      return;
    }
    switch (action.kind) {
      case "navigate":
        if (action.route === "payloadStudio") {
          this.getRouter().navTo("payloadStudio", {
            "?query": { state: DeepLinkHelper.encode({ messageId }) },
          });
        } else if (action.route !== undefined) {
          this.navTo(action.route);
        }
        break;
      case "drawerTab":
        this.model().setProperty("/drawer/expanded", true);
        this.model().setProperty("/drawer/activeTab", action.drawerTab ?? "overview");
        if (this.model().getProperty("/drawer/detail") === null) {
          void this.loadDetail(messageId);
        }
        break;
      case "copy":
        void this.copyForAction(action, messageId);
        break;
      case "viewDetails":
        this.openExpandedDetail(messageId);
        break;
      case "recover":
        void this.startRecoveryFlow(messageId);
        break;
      case "download":
        void this.downloadForMessage(messageId);
        break;
      case "future":
        MessageToast.show(this.getText("investigation.action.future"));
        break;
    }
  }

  private async copyForAction(
    action: InvestigationActionDefinition,
    messageId: string,
  ): Promise<void> {
    const detail = this.model().getProperty("/drawer/detail") as {
      correlationId: string;
      sapStandardHeaders: Record<string, string>;
      customHeaders: Record<string, string>;
    } | null;
    let text = messageId;
    if (action.copyField === "correlationId") {
      text = detail?.correlationId ?? messageId;
    } else if (action.copyField === "headers" && detail !== null) {
      text = JSON.stringify({ ...detail.sapStandardHeaders, ...detail.customHeaders }, null, 2);
    } else if (action.copyField === "metadata") {
      const item = (this.model().getProperty("/items") as MessageMonitoringItem[]).find(
        (row) => row.messageId === messageId,
      );
      text = JSON.stringify(item ?? { messageId }, null, 2);
    }
    const succeeded = await ClipboardUtils.copyText(text);
    MessageToast.show(
      this.getText(succeeded ? "investigation.copy.success" : "investigation.copy.failure"),
    );
  }

  // --- Context navigation -------------------------------------------------------

  /** Opens the Runtime Center for the context panel's runtime reference. */
  public onOpenRuntimeFromContext(): void {
    this.navTo("runtimeCenter");
  }

  /** Opens JMS Queues for the context panel's queue reference. */
  public onOpenQueueFromContext(): void {
    this.navTo("jmsQueue");
  }

  /** Opens the Certificate & Security Center for the context panel's certificate watch. */
  public onOpenCertificateFromContext(): void {
    this.navTo("certificateSecurityCenter");
  }

  /** Opens Alerts for a context panel notification. */
  public onOpenAlertFromContext(): void {
    this.navTo("alertNotification");
  }

  // --- Export --------------------------------------------------------------------

  /** Opens the shared Export dialog (§ Export). */
  public async onExportPress(): Promise<void> {
    const dialog = (await Fragment.load({
      name: "com.middlewareops.integrationportal.library.fragments.ExportDialog",
      controller: this,
    })) as Dialog;
    dialog.setModel(
      new JSONModel({
        format: "csv",
        formats: (Object.keys(EXPORT_FILE_TYPE) as MessageExportFormat[]).map((key) => ({
          key,
          text: FileTypes[EXPORT_FILE_TYPE[key]].label,
        })),
      }),
      "export",
    );
    this.getView()?.addDependent(dialog);
    dialog.attachAfterClose(() => dialog.destroy());
    dialog.open();
  }

  /** Confirms the export dialog and triggers the download. */
  public async onExportConfirm(event: Event): Promise<void> {
    const source = event.getSource() as unknown as { getParent(): Dialog };
    const dialog = source.getParent();
    const format = (dialog.getModel("export") as JSONModel).getProperty("/format") as
      | MessageExportFormat
      | undefined;
    dialog.close();
    if (format === undefined) {
      return;
    }
    const criteria = this.model().getProperty("/criteria") as MessageSearchCriteria;
    const content = await this.service.exportRows(criteria, format);
    DownloadUtils.downloadAs(content, "message-investigation", EXPORT_FILE_TYPE[format]);
  }

  /** Cancels the export dialog. */
  public onExportCancel(event: Event): void {
    const source = event.getSource() as unknown as { getParent(): Dialog };
    source.getParent().close();
  }

  // --- Layout persistence --------------------------------------------------------

  /** Persists the current pane sizes when the context/drawer splitter is resized. */
  public onPanelResize(): void {
    const model = this.model();
    this.panelLayout.update({
      advancedSearchOpen: model.getProperty("/advancedSearchOpen") as boolean,
      contextCollapsed: model.getProperty("/contextCollapsed") as boolean,
      drawerExpanded: model.getProperty("/drawer/expanded") as boolean,
    });
  }

  /**
   * Toggles the top Advanced Search panel's open state.
   *
   * `sap.m.ToggleButton`'s `press` event carries **`pressed`** (not `state` — that's `sap.m.Switch`'s
   * `change` parameter). Reading the wrong name yields `undefined`, and assigning `undefined` to a UI5
   * boolean property *resets it to its default* — for `visible` that default is `true`, so the panel
   * would open and then never close again.
   */
  public onToggleAdvancedSearch(event: Event): void {
    const open = event.getParameter("pressed" as never) === true;
    this.model().setProperty("/advancedSearchOpen", open);
    this.panelLayout.update({ advancedSearchOpen: open });
  }

  /** Toggles the Context Panel's collapsed state. */
  public onToggleContextPanel(): void {
    const collapsed = !(this.model().getProperty("/contextCollapsed") as boolean);
    this.model().setProperty("/contextCollapsed", collapsed);
    this.onPanelResize();
  }

  private applyPanelLayout(): void {
    const snapshot = this.panelLayout.getSnapshot();
    this.model().setProperty("/advancedSearchOpen", snapshot.advancedSearchOpen);
    this.model().setProperty("/contextCollapsed", snapshot.contextCollapsed);
    this.model().setProperty("/drawer/expanded", snapshot.drawerExpanded);
  }

  // --- Helpers ---------------------------------------------------------------------

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private hasRole(roleCollection: string): boolean {
    return UserContext.getInstance()
      .getPermissionEngine()
      .isSatisfied({ anyRoleCollection: [roleCollection] });
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

  private static dataOf(source: object, key: string): unknown {
    return (source as { data?(k: string): unknown }).data?.(key);
  }
}
