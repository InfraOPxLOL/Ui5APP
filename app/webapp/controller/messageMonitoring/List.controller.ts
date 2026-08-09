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
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type ListBinding from "sap/ui/model/ListBinding";
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
import MessageMonitoringFormatter from "../../formatter/messageMonitoring/MessageMonitoringFormatter";
import MessageMonitoringModel from "../../model/messageMonitoring/MessageMonitoringModel";
import { messageInvestigationTableConfig } from "../../config/messageMonitoring/columns";
import { SMART_FILTERS } from "../../config/messageMonitoring/smartFilters";
import {
  INVESTIGATION_ACTIONS,
  type InvestigationActionDefinition,
} from "../../config/messageMonitoring/investigationActions";
import type {
  JmsRetryCheck,
  MessageExportFormat,
  MessageMonitoringItem,
  MessageSearchCriteria,
  SmartFilter,
} from "../../service/messageMonitoring/MessageInvestigationTypes";

/** Bulk-retry preview state for one selected message (§ JMS Retry). */
interface BulkRetryPreviewItem {
  readonly messageId: string;
  readonly check: JmsRetryCheck;
}

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
    this.bulkRetryDialog?.destroy();
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
      const jmsFilter = model.getProperty("/jmsFilter") as "all" | "jms" | "nonJms";
      if (jmsFilter !== "all") {
        await this.classifyVisibleRows();
      }
      this.applyJmsFilter(jmsFilter);
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

  /** Selects a Detail Drawer tab; lazily loads the JMS Retry check on first visit. */
  public onDrawerTabSelect(event: Event): void {
    const key = (event.getParameter("key" as never) as string | undefined) ?? "overview";
    this.model().setProperty("/drawer/activeTab", key);
    if (key === "jmsRetry" && !(this.model().getProperty("/jmsRetry/checked") as boolean)) {
      const messageId = this.model().getProperty("/selectedMessageId") as string;
      if (messageId !== "") {
        void this.loadJmsRetryCheck(messageId);
      }
    }
  }

  // --- JMS Retry (§ JMS Retry) ---------------------------------------------------

  private async loadJmsRetryCheck(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/jmsRetry/busy", true);
    try {
      const check = await this.service.getRetryCheck(messageId);
      model.setProperty("/jmsRetry", {
        busy: false,
        checked: true,
        eligible: check.eligible,
        reason: check.reason ?? "",
        resolvedQueue: check.resolvedQueue ?? "",
        currentQueue: check.currentQueue ?? "",
        resolutionSource: check.resolutionSource,
        retryCount: check.retryCount,
      });
    } catch (error) {
      model.setProperty("/jmsRetry/busy", false);
      this.getErrorHandler().handle(error);
    }
  }

  /** Retry button inside the Detail Drawer's JMS Retry tab. */
  public onRetryFromDrawerPress(): void {
    const messageId = this.model().getProperty("/selectedMessageId") as string;
    if (messageId !== "") {
      void this.startRetryFlow(messageId);
    }
  }

  /**
   * Starts the single-message retry confirm flow (§ JMS Retry): resolves the queue + retry count via
   * a fresh {@link MessageMonitoringService.getRetryCheck} call, then either confirms with the
   * resolved queue or asks the operator to pick one manually.
   */
  private async startRetryFlow(messageId: string): Promise<void> {
    let check: JmsRetryCheck;
    try {
      check = await this.service.getRetryCheck(messageId);
    } catch (error) {
      this.getErrorHandler().handle(error);
      return;
    }
    if (!check.eligible) {
      MessageToast.show(check.reason ?? this.getText("investigation.retry.notEligible"));
      return;
    }
    if (check.currentQueue !== undefined) {
      const currentQueue = check.currentQueue;
      MessageBox.confirm(
        this.getText("investigation.retry.confirm.text", [
          currentQueue,
          String(check.retryCount ?? 0),
        ]),
        {
          title: this.getText("investigation.retry.confirm.title"),
          onClose: (action: unknown) => {
            if (action === MessageBox.Action.OK) {
              void this.executeRetry(messageId, currentQueue);
            }
          },
        },
      );
      return;
    }
    await this.openManualQueueDialog(messageId, check.resolvedQueue);
  }

  private async executeRetry(messageId: string, queueName: string): Promise<void> {
    const model = this.model();
    model.setProperty("/grid/busy", true);
    try {
      const result = await this.service.retry(messageId, queueName);
      MessageToast.show(
        this.getText(
          result.accepted ? "investigation.retry.success" : "investigation.retry.failure",
          [queueName],
        ),
      );
      model.setProperty("/jmsRetry/checked", false);
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
            void this.executeRetry(messageId, queueName);
          }
        },
      }),
      endButton: new Button({ text: this.getText("action.cancel"), press: () => dialog.close() }),
      afterClose: () => dialog.destroy(),
    });
    this.getView()?.addDependent(dialog);
    dialog.open();
  }

  /** Toolbar "Retry Selected" — bulk-retries every JMS-eligible selected message (§ JMS Retry). */
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
    let previews: BulkRetryPreviewItem[];
    try {
      previews = await Promise.all(
        selectedIds.map(async (messageId) => ({
          messageId,
          check: await this.service.getRetryCheck(messageId),
        })),
      );
    } catch (error) {
      model.setProperty("/grid/busy", false);
      this.getErrorHandler().handle(error);
      return;
    }
    model.setProperty("/grid/busy", false);

    const retryable = previews.filter(
      (preview) => preview.check.eligible && preview.check.currentQueue !== undefined,
    );
    const needsManual = previews.filter(
      (preview) => preview.check.eligible && preview.check.currentQueue === undefined,
    );
    if (retryable.length === 0) {
      MessageToast.show(this.getText("investigation.retry.bulk.noneEligible"));
      return;
    }

    MessageBox.confirm(this.getText("investigation.retry.bulk.confirm.text", [retryable.length]), {
      title: this.getText("investigation.retry.bulk.confirm.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.executeBulkRetry(retryable, needsManual.length);
        }
      },
    });
  }

  private async executeBulkRetry(
    retryable: readonly BulkRetryPreviewItem[],
    needsManualCount: number,
  ): Promise<void> {
    const dialog = await this.getBulkRetryDialog();
    const dialogModel = dialog.getModel("bulkRetry") as JSONModel;
    dialogModel.setData({ busy: true, summary: "", results: [] });
    dialog.open();

    const results: { messageId: string; queueName: string; accepted: boolean; note: string }[] = [];
    for (const preview of retryable) {
      try {
        const result = await this.service.retry(
          preview.messageId,
          preview.check.currentQueue as string,
        );
        results.push(result);
      } catch (error) {
        results.push({
          messageId: preview.messageId,
          queueName: preview.check.currentQueue ?? "",
          accepted: false,
          note: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const succeeded = results.filter((result) => result.accepted).length;
    let summary = this.getText("investigation.retry.bulk.complete", [succeeded, results.length]);
    if (needsManualCount > 0) {
      summary += " " + this.getText("investigation.retry.bulk.needsManual", [needsManualCount]);
    }
    dialogModel.setData({ busy: false, summary, results });
    await this.refresh();
  }

  private async getBulkRetryDialog(): Promise<Dialog> {
    if (this.bulkRetryDialog === undefined) {
      this.bulkRetryDialog = (await Fragment.load({
        name: "com.middlewareops.integrationportal.fragment.messageMonitoring.BulkRetryResultsDialog",
        controller: this,
      })) as Dialog;
      this.bulkRetryDialog.setModel(new JSONModel({ busy: false, summary: "", results: [] }), "bulkRetry");
      this.getView()?.addDependent(this.bulkRetryDialog);
    }
    return this.bulkRetryDialog;
  }

  /** Closes the bulk retry results dialog. */
  public onBulkRetryResultsClose(): void {
    this.bulkRetryDialog?.close();
  }

  // --- JMS/Non-JMS toggle ---------------------------------------------------------

  /** Switches the grid between All / JMS-only / Non-JMS-only, classifying loaded rows on demand. */
  public async onJmsFilterChange(event: Event): Promise<void> {
    const item = event.getParameter("item" as never) as { getKey(): string } | undefined;
    const key = (item?.getKey() ?? "all") as "all" | "jms" | "nonJms";
    this.model().setProperty("/jmsFilter", key);
    if (key !== "all") {
      this.model().setProperty("/grid/busy", true);
      try {
        await this.classifyVisibleRows();
      } finally {
        this.model().setProperty("/grid/busy", false);
      }
    }
    this.applyJmsFilter(key);
  }

  /** Classifies every currently-loaded row that hasn't been classified yet, in parallel. */
  private async classifyVisibleRows(): Promise<void> {
    const items = this.model().getProperty("/items") as MessageMonitoringItem[];
    const unclassified = items.filter((item) => item.jmsEligible === undefined);
    if (unclassified.length === 0) {
      return;
    }
    const results = await Promise.all(
      unclassified.map(async (item) => {
        try {
          const result = await this.service.checkJmsEligibility(item.messageId);
          return { messageId: item.messageId, eligible: result.eligible };
        } catch {
          return { messageId: item.messageId, eligible: false };
        }
      }),
    );
    const eligibilityById = new Map(results.map((result) => [result.messageId, result.eligible]));
    const updated = items.map((item) =>
      eligibilityById.has(item.messageId)
        ? { ...item, jmsEligible: eligibilityById.get(item.messageId) }
        : item,
    );
    this.model().setProperty("/items", updated);
  }

  private applyJmsFilter(key: "all" | "jms" | "nonJms"): void {
    const binding = this.grid.getBinding("rows") as ListBinding | undefined;
    if (binding === undefined) {
      return;
    }
    if (key === "all") {
      binding.filter([]);
    } else {
      binding.filter([new Filter("jmsEligible", FilterOperator.EQ, key === "jms")]);
    }
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

  private bulkRetryDialog: Dialog | undefined;

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
      case "retryJms":
        void this.startRetryFlow(messageId);
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
