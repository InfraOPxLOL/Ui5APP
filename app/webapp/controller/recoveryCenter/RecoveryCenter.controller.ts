import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import type Event from "sap/ui/base/Event";
import type Table from "sap/m/Table";
import type ListBinding from "sap/ui/model/ListBinding";
import RecoveryCenterService from "../../service/recoveryCenter/RecoveryCenterService";
import RecoveryLayoutService from "../../service/recoveryCenter/RecoveryLayoutService";
import RecoveryCenterFormatter from "../../formatter/recoveryCenter/RecoveryCenterFormatter";
import UserContext from "../../shell/context/UserContext";
import { RoleCollections } from "../../shell/permissions/RoleCollections";
import RecoveryCenterModel, {
  initialPreview,
} from "../../model/recoveryCenter/RecoveryCenterModel";
import type {
  ContextPanelState,
  PreviewState,
  RecoveryTabKey,
} from "../../model/recoveryCenter/RecoveryCenterModel";
import type {
  ExplorerLayoutSnapshot,
  SavedExplorerLayout,
} from "../../service/recoveryCenter/RecoveryLayoutService";
import type {
  QueueHealthSummary,
  RecoveryCandidate,
  RecoveryHistoryEntry,
  RecoveryResult,
} from "../../service/recoveryCenter/RecoveryCenterTypes";

/**
 * Controller for the Recovery Center (Phase 11).
 *
 * A complete operational workspace for recovering failed integrations parked on JMS dead-letter and
 * retry queues. Consumes **only** `/api/v1/recovery-center` (itself composed entirely from the
 * Operations Engine's `RecoveryEngine`) — it never talks to the SDK, never knows a JMS endpoint or
 * queue entity-set name, holding no business logic of its own beyond orchestration.
 *
 * @namespace com.middlewareops.integrationportal.controller.recoveryCenter
 */
export default class RecoveryCenterController extends BaseController {
  private readonly service = new RecoveryCenterService();
  private readonly layoutService = RecoveryLayoutService.getInstance();
  private dashboardAbort: AbortController | undefined;

  /** Lifecycle hook: loads the dashboard/candidates/queue health/DLQ overview and history. */
  public onInit(): void {
    this.setModel(new RecoveryCenterModel(), "view");
    this.model().setProperty("/savedLayouts", this.layoutService.getAll());
    void this.loadAll();
    void this.loadHistory();
  }

  /** Lifecycle hook: aborts in-flight requests. */
  public onExit(): void {
    this.dashboardAbort?.abort();
  }

  /** Manual refresh — reloads the dashboard composite and Recovery History. */
  public onRefreshPress(): void {
    void this.loadAll();
    void this.loadHistory();
  }

  /** Switches the active section tab. */
  public onTabSelect(event: Event): void {
    const key = event.getParameter("key" as never) as string | undefined as
      | RecoveryTabKey
      | undefined;
    if (key !== undefined) {
      this.model().setProperty("/activeTab", key);
    }
  }

  // --- Data loading -----------------------------------------------------------------------------

  private async loadAll(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.dashboardAbort?.abort();
    this.dashboardAbort = new AbortController();
    try {
      const dashboard = await this.service.getDashboard(this.dashboardAbort.signal);
      model.setProperty("/dashboard", dashboard);
      model.setProperty("/candidates", dashboard.candidates);
      model.setProperty("/queueHealth", dashboard.queueHealth);
      model.setProperty("/dlqOverview", dashboard.dlqOverview);
      model.setProperty("/statistics", dashboard.statistics);
      model.setProperty("/error", "");
    } catch (error) {
      model.setProperty("/error", this.errorText(error));
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private async loadHistory(): Promise<void> {
    const model = this.model();
    const skip = model.getProperty("/historySkip") as number;
    const top = model.getProperty("/historyTop") as number;
    try {
      const page = await this.service.getHistory(skip, top);
      model.setProperty("/history", { items: page.items, total: page.total });
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  // --- Recovery Candidates (§ Recovery Candidates) -----------------------------------------------

  /** Applies a smart filter (all/ready/blocked) to the candidates table. */
  public onCandidateSmartFilterChange(event: Event): void {
    const key =
      (event.getParameter("item" as never) as { getKey(): string } | undefined)?.getKey() ?? "all";
    this.model().setProperty("/candidateSmartFilter", key);
    const binding = (this.byId("recoveryCandidatesTable") as Table | undefined)?.getBinding(
      "items",
    ) as ListBinding | undefined;
    if (binding === undefined) {
      return;
    }
    binding.filter(key === "all" ? [] : [new Filter("readiness", FilterOperator.EQ, key)]);
  }

  /** Toggles grouping candidates by their source (destination) queue. */
  public onCandidateGroupByToggle(): void {
    const grouped = !(this.model().getProperty("/candidateGroupBySource") as boolean);
    this.model().setProperty("/candidateGroupBySource", grouped);
    const binding = (this.byId("recoveryCandidatesTable") as Table | undefined)?.getBinding(
      "items",
    ) as ListBinding | undefined;
    binding?.sort(grouped ? [new Sorter("sourceQueue", false, true)] : []);
  }

  /** Tracks the candidates table's multi-selection for bulk recovery. */
  public onCandidateSelectionChange(event: Event): void {
    const table = event.getSource() as Table;
    const queueNames = table
      .getSelectedContexts()
      .map((context) => (context.getObject() as RecoveryCandidate).queueName);
    this.model().setProperty("/selectedCandidateQueues", queueNames);
  }

  /** Opens the Recovery Preview for every selected candidate. */
  public onRecoverSelectedPress(): void {
    const queueNames = this.model().getProperty("/selectedCandidateQueues") as string[];
    if (queueNames.length === 0) {
      MessageToast.show(this.getText("recovery.candidates.noSelection"));
      return;
    }
    void this.openPreview(queueNames);
  }

  /** Opens the Recovery Preview for every candidate on the tenant (requires the admin permission). */
  public onRecoverAllPress(): void {
    if (!this.hasRole(RoleCollections.RecoveryAdmin)) {
      MessageToast.show(this.getText("recovery.candidates.adminRequired"));
      return;
    }
    const candidates = this.model().getProperty("/candidates") as RecoveryCandidate[];
    if (candidates.length === 0) {
      MessageToast.show(this.getText("recovery.candidates.noSelection"));
      return;
    }
    void this.openPreview(candidates.map((candidate) => candidate.queueName));
  }

  /** Opens the Recovery Preview for a single candidate row. */
  public onRecoverCandidatePress(event: Event): void {
    const candidate = this.contextOf<RecoveryCandidate>(event);
    if (candidate !== undefined) {
      void this.openPreview([candidate.queueName]);
    }
  }

  // --- Recovery Preview / confirmation (§ Recovery Preview, § Recovery Validation) ----------------

  private async openPreview(queueNames: string[]): Promise<void> {
    const model = this.model();
    model.setProperty("/preview", { ...initialPreview(), open: true, busy: true, queueNames });
    try {
      const previews = await Promise.all(
        queueNames.map((queueName) => this.service.preview(queueName)),
      );
      const totalMessageCount = previews.reduce((sum, preview) => sum + preview.messageCount, 0);
      const totalEstimatedDurationMs = previews.reduce(
        (sum, preview) => sum + preview.estimatedDurationMs,
        0,
      );
      const allPassed = previews.every((preview) => preview.validation.passed);
      model.setProperty("/preview", {
        open: true,
        busy: false,
        queueNames,
        previews,
        totalMessageCount,
        totalEstimatedDurationMs,
        allPassed,
        dryRun: false,
        confirming: false,
        results: [],
      } satisfies PreviewState);
    } catch (error) {
      this.getErrorHandler().handle(error);
      this.onClosePreview();
    }
  }

  /** Toggles dry-run simulation for the pending recovery (§ Recovery Operations — "Dry-run simulation"). */
  public onDryRunToggle(event: Event): void {
    const state = event.getParameter("state" as never) as boolean | undefined;
    this.model().setProperty("/preview/dryRun", state ?? false);
  }

  /** The explicit confirmation step — executes (or dry-run simulates) every previewed recovery. */
  public async onConfirmRecoveryPress(): Promise<void> {
    const model = this.model();
    const preview = model.getProperty("/preview") as PreviewState;
    if (!preview.allPassed) {
      MessageToast.show(this.getText("recovery.preview.validationBlocked"));
      return;
    }
    model.setProperty("/preview/confirming", true);
    const results: RecoveryResult[] = [];
    for (const queueName of preview.queueNames) {
      try {
        results.push(await this.service.recover(queueName, { dryRun: preview.dryRun }));
      } catch (error) {
        this.getErrorHandler().handle(error);
      }
    }
    model.setProperty("/preview/results", results);
    model.setProperty("/preview/confirming", false);
    const recovered = results.filter((result) => result.status === "completed").length;
    MessageToast.show(
      this.getText(
        preview.dryRun ? "recovery.preview.dryRunComplete" : "recovery.preview.complete",
        [String(recovered), String(results.length)],
      ),
    );
    await this.loadAll();
    await this.loadHistory();
  }

  /** Closes the preview dialog without acting (Cancel). */
  public onClosePreview(): void {
    this.model().setProperty("/preview", initialPreview());
  }

  // --- Recovery History (§ Recovery History) -------------------------------------------------------

  /** Advances Recovery History to the next page. */
  public onHistoryNextPress(): void {
    const model = this.model();
    const skip =
      (model.getProperty("/historySkip") as number) + (model.getProperty("/historyTop") as number);
    model.setProperty("/historySkip", skip);
    void this.loadHistory();
  }

  /** Returns Recovery History to the previous page. */
  public onHistoryPreviousPress(): void {
    const model = this.model();
    const top = model.getProperty("/historyTop") as number;
    const skip = Math.max(0, (model.getProperty("/historySkip") as number) - top);
    model.setProperty("/historySkip", skip);
    void this.loadHistory();
  }

  /** Cancels a recorded-but-not-yet-finalized recovery. */
  public async onCancelRecoveryPress(event: Event): Promise<void> {
    const entry = this.contextOf<RecoveryHistoryEntry>(event);
    if (entry === undefined) {
      return;
    }
    try {
      await this.service.cancel(entry.recoveryId);
      MessageToast.show(this.getText("recovery.history.cancelled"));
      await this.loadHistory();
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  /** Retries a previously failed or cancelled recovery. */
  public async onRetryRecoveryPress(event: Event): Promise<void> {
    const entry = this.contextOf<RecoveryHistoryEntry>(event);
    if (entry === undefined) {
      return;
    }
    try {
      await this.service.retry(entry.recoveryId);
      MessageToast.show(this.getText("recovery.history.retried"));
      await this.loadHistory();
      await this.loadAll();
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  // --- Queue Explorer (§ Queue Explorer) -----------------------------------------------------------

  /** Searches the Queue Explorer table by queue/display name. */
  public onExplorerSearch(event: Event): void {
    const query = ((event.getParameter("query" as never) as string | undefined) ?? "").trim();
    this.model().setProperty("/explorerSearch", query);
    this.applyExplorerFilter(query);
  }

  private applyExplorerFilter(query: string): void {
    const binding = (this.byId("queueExplorerTable") as Table | undefined)?.getBinding("items") as
      | ListBinding
      | undefined;
    if (binding === undefined) {
      return;
    }
    binding.filter(
      query === ""
        ? []
        : [
            new Filter({
              filters: [
                new Filter("queueName", FilterOperator.Contains, query),
                new Filter("displayName", FilterOperator.Contains, query),
              ],
              and: false,
            }),
          ],
    );
  }

  /** Changes the Queue Explorer's sort field. */
  public onExplorerSortChange(event: Event): void {
    const key = (event.getParameter("item" as never) as { getKey(): string } | undefined)?.getKey();
    if (key === undefined) {
      return;
    }
    this.model().setProperty("/explorerSort/field", key);
    this.applyExplorerSort();
  }

  /** Toggles the Queue Explorer's sort direction. */
  public onExplorerSortDirectionToggle(): void {
    const descending = !(this.model().getProperty("/explorerSort/descending") as boolean);
    this.model().setProperty("/explorerSort/descending", descending);
    this.applyExplorerSort();
  }

  private applyExplorerSort(): void {
    const binding = (this.byId("queueExplorerTable") as Table | undefined)?.getBinding("items") as
      | ListBinding
      | undefined;
    if (binding === undefined) {
      return;
    }
    const state = this.model().getProperty("/explorerSort") as {
      field: string;
      descending: boolean;
    };
    binding.sort(new Sorter(state.field, state.descending));
  }

  // --- Saved layouts (§ Queue Explorer — "Saved layouts") ------------------------------------------

  /** Opens the "Save layout" dialog. */
  public onOpenSaveLayoutDialogPress(): void {
    this.model().setProperty("/layoutNameDraft", "");
    this.model().setProperty("/saveLayoutDialogOpen", true);
  }

  /** Confirms saving the current search/sort as a named layout. */
  public onConfirmSaveLayoutPress(): void {
    const model = this.model();
    const name = (model.getProperty("/layoutNameDraft") as string).trim();
    if (name === "") {
      return;
    }
    const explorerSort = model.getProperty("/explorerSort") as {
      field: string;
      descending: boolean;
    };
    const snapshot: ExplorerLayoutSnapshot = {
      search: model.getProperty("/explorerSearch") as string,
      sortField: explorerSort.field,
      sortDescending: explorerSort.descending,
    };
    this.layoutService.save(name, snapshot);
    model.setProperty("/savedLayouts", this.layoutService.getAll());
    model.setProperty("/saveLayoutDialogOpen", false);
  }

  /** Cancels the "Save layout" dialog. */
  public onCancelSaveLayoutPress(): void {
    this.model().setProperty("/saveLayoutDialogOpen", false);
  }

  /** Applies a previously saved layout. */
  public onApplyLayoutPress(event: Event): void {
    const layout = this.contextOf<SavedExplorerLayout>(event);
    if (layout === undefined) {
      return;
    }
    const model = this.model();
    model.setProperty("/explorerSearch", layout.snapshot.search);
    model.setProperty("/explorerSort", {
      field: layout.snapshot.sortField,
      descending: layout.snapshot.sortDescending,
    });
    this.applyExplorerFilter(layout.snapshot.search);
    this.applyExplorerSort();
  }

  /** Deletes a saved layout. */
  public onDeleteLayoutPress(event: Event): void {
    // sap.m.List's "delete" event fires on the List; the deleted row is the "listItem" parameter,
    // not the event source, so this can't reuse the generic `contextOf` helper (built for `press`).
    const listItem = event.getParameter("listItem" as never) as
      | { getBindingContext(model: string): { getObject(): unknown } | null | undefined }
      | undefined;
    const layout = listItem?.getBindingContext("view")?.getObject() as
      | SavedExplorerLayout
      | undefined;
    if (layout === undefined) {
      return;
    }
    this.layoutService.remove(layout.id);
    this.model().setProperty("/savedLayouts", this.layoutService.getAll());
  }

  // --- Context Panel (§ Context Panel) --------------------------------------------------------------

  /** Opens the Context Panel for a recovery candidate. */
  public onCandidateContextPress(event: Event): void {
    const candidate = this.contextOf<RecoveryCandidate>(event);
    if (candidate === undefined) {
      return;
    }
    this.model().setProperty("/contextPanel", { open: true, candidate, queue: null });
  }

  /** Opens the Context Panel for a queue (from Queue Explorer / Queue Health). */
  public onQueueContextPress(event: Event): void {
    const queue = this.contextOf<QueueHealthSummary>(event);
    if (queue === undefined) {
      return;
    }
    this.model().setProperty("/contextPanel", { open: true, candidate: null, queue });
  }

  /** Closes the Context Panel. */
  public onCloseContextPanelPress(): void {
    this.model().setProperty("/contextPanel/open", false);
  }

  /** Quick action: opens the Recovery Preview for the queue shown in the Context Panel. */
  public onContextRecoverPress(): void {
    const candidate = (this.model().getProperty("/contextPanel") as ContextPanelState).candidate;
    if (candidate !== null) {
      void this.openPreview([candidate.queueName]);
    }
  }

  /** Quick action: copies the Context Panel's queue name to the clipboard. */
  public onContextCopyQueueNamePress(): void {
    const contextPanel = this.model().getProperty("/contextPanel") as ContextPanelState;
    const name = contextPanel.candidate?.queueName ?? contextPanel.queue?.queueName ?? "";
    if (name === "") {
      return;
    }
    void navigator.clipboard.writeText(name);
    MessageToast.show(this.getText("recovery.contextPanel.copied"));
  }

  /** Quick action: opens Message Investigation (Related Navigation). */
  public onOpenMessageMonitoringPress(): void {
    this.navTo("messageMonitoring");
  }

  /** Quick action: opens the Runtime Center (Related Navigation — runtime status). */
  public onOpenLiveMonitoringPress(): void {
    this.navTo("runtimeCenter");
  }

  // --- Binding formatters (delegated to RecoveryCenterFormatter) -----------------------------------

  public formatReadinessState(readiness: string): string {
    return RecoveryCenterFormatter.readinessState(readiness);
  }

  public formatReadinessIcon(readiness: string): string {
    return RecoveryCenterFormatter.readinessIcon(readiness);
  }

  public formatConsumerState(status: string): string {
    return RecoveryCenterFormatter.consumerState(status);
  }

  public formatGrowthTrendIcon(trend: string): string {
    return RecoveryCenterFormatter.growthTrendIcon(trend);
  }

  public formatGrowthTrendState(trend: string): string {
    return RecoveryCenterFormatter.growthTrendState(trend);
  }

  public formatHealthScoreState(score: number): string {
    return RecoveryCenterFormatter.healthScoreState(score);
  }

  public formatRecoveryStatusState(status: string): string {
    return RecoveryCenterFormatter.recoveryStatusState(status);
  }

  public formatRecoveryStatusIcon(status: string): string {
    return RecoveryCenterFormatter.recoveryStatusIcon(status);
  }

  public formatCheckState(passed: boolean): string {
    return RecoveryCenterFormatter.checkState(passed);
  }

  public formatCheckIcon(passed: boolean): string {
    return RecoveryCenterFormatter.checkIcon(passed);
  }

  public formatDateTime(value: string | undefined): string {
    return RecoveryCenterFormatter.dateTime(value);
  }

  public formatRelative(value: string | undefined): string {
    return RecoveryCenterFormatter.relative(value);
  }

  public formatDuration(millis: number | undefined): string {
    return RecoveryCenterFormatter.duration(millis);
  }

  public formatMessageAge(millis: number | undefined): string {
    return RecoveryCenterFormatter.messageAge(millis);
  }

  public formatHasItems(count: number): boolean {
    return RecoveryCenterFormatter.hasItems(count);
  }

  // --- Helpers ---------------------------------------------------------------------------------

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private hasRole(roleCollection: string): boolean {
    return UserContext.getInstance()
      .getPermissionEngine()
      .isSatisfied({ anyRoleCollection: [roleCollection] });
  }

  private contextOf<T>(event: Event): T | undefined {
    const source = event.getSource() as unknown as {
      getBindingContext(model: string): { getObject(): unknown } | null | undefined;
    };
    return (source.getBindingContext("view")?.getObject() as T | undefined) ?? undefined;
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
