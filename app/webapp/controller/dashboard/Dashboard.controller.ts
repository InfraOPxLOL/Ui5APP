import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import type List from "sap/m/List";
import OperationsOverviewService from "../../service/dashboard/OperationsOverviewService";
import OperationsFormatter from "../../formatter/dashboard/OperationsFormatter";
import DashboardModel from "../../model/dashboard/DashboardModel";
import ConfigService from "../../core/services/config/ConfigService";
import TenantContext from "../../shell/context/TenantContext";
import FavoritesService from "../../shell/favorites/FavoritesService";
import AppEventBus from "../../core/events/AppEventBus";
import ExportHelper from "../../core/utils/ExportHelper";
import { Colors } from "../../core/constants/Colors";
import { ShellCommands } from "../../shell/actions/QuickActionRegistry";
import { OPERATIONS_QUICK_ACTIONS } from "../../config/dashboard/operationsQuickActions";
import type {
  HealthWidget,
  InterfaceSummary,
  OperationsOverview,
  TimelineEvent,
} from "../../service/dashboard/OperationsTypes";

/** Health-widget id → drill-down route. */
const HEALTH_DRILLDOWN: Readonly<Record<string, string>> = {
  runtime: "messageMonitoring",
  deployment: "messageMonitoring",
  queue: "jmsQueue",
  certificate: "certificateSecurityCenter",
  alert: "alertNotification",
};

/**
 * Controller for the Operations Workspace overview (Phase 8).
 *
 * The command center for Integration Suite operators. It consumes **only** the Operations Overview
 * DTO (from `/api/v1/operations`, itself composed entirely from the Operations Engine) — it never
 * talks to the SDK, never knows an Integration Suite endpoint. It owns live refresh (§7),
 * environment awareness (§10), the workspace search (§6), quick actions (§5) and drill-down
 * navigation, holding no business logic of its own.
 *
 * @namespace com.middlewareops.integrationportal.controller.dashboard
 */
export default class DashboardController extends BaseController {
  private readonly service = new OperationsOverviewService();
  private readonly favorites = FavoritesService.getInstance();
  private refreshTimer: number | undefined;
  private overviewAbort: AbortController | undefined;
  private searchAbort: AbortController | undefined;
  private envStyleClass = "";

  /**
   * Lifecycle hook: resolves environment awareness, quick actions and favorite state, loads the
   * overview, and starts live auto-refresh. Reloads on tenant switch.
   */
  public onInit(): void {
    this.setModel(new DashboardModel(), "view");
    this.applyEnvironment();
    this.applyQuickActions();
    this.applyRefreshInterval();
    this.model().setProperty("/favorite", this.favorites.isFavoriteWorkspace("operations"));

    TenantContext.getInstance().onTenantChanged(() => {
      this.applyEnvironment();
      void this.loadOverview();
    }, this);

    void this.loadOverview();
    this.startAutoRefresh();
  }

  /** Lifecycle hook: stops the refresh timer and aborts in-flight requests. */
  public onExit(): void {
    this.stopAutoRefresh();
    this.overviewAbort?.abort();
    this.searchAbort?.abort();
  }

  // --- Data loading ---------------------------------------------------------

  private async loadOverview(): Promise<void> {
    const model = this.model();
    model.setProperty("/refresh/refreshing", true);
    model.setProperty("/busy", model.getProperty("/loaded") !== true);
    this.overviewAbort?.abort();
    this.overviewAbort = new AbortController();
    const windowHours = model.getProperty("/windowHours") as number;
    try {
      const overview = await this.service.getOverview(windowHours, this.overviewAbort.signal);
      model.setProperty("/overview", overview);
      model.setProperty("/loaded", true);
      const now = new Date().toISOString();
      model.setProperty("/refresh/lastRefreshed", now);
      model.setProperty("/refresh/lastRefreshedText", OperationsFormatter.relativeTime(now));
      model.setProperty("/refresh/error", "");
    } catch (error) {
      model.setProperty("/refresh/error", this.errorText(error));
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/refresh/refreshing", false);
      model.setProperty("/busy", false);
    }
  }

  /** Manual refresh (§7). */
  public onRefreshPress(): void {
    void this.loadOverview();
  }

  /** Toggles auto-refresh on/off (§7). */
  public onToggleAutoRefresh(event: Event): void {
    const state = event.getParameter("state" as never) as boolean | undefined;
    this.model().setProperty("/refresh/auto", state ?? !this.model().getProperty("/refresh/auto"));
    this.startAutoRefresh();
  }

  /** Pauses/resumes auto-refresh without losing the toggle (§7). */
  public onPauseRefresh(): void {
    const paused = !(this.model().getProperty("/refresh/paused") as boolean);
    this.model().setProperty("/refresh/paused", paused);
    this.startAutoRefresh();
  }

  /** Changes the statistics window and reloads. */
  public onWindowChange(event: Event): void {
    const key = (
      event.getParameter("selectedItem" as never) as { getKey(): string } | undefined
    )?.getKey();
    if (key !== undefined && key !== "") {
      this.model().setProperty("/windowHours", Number(key));
      void this.loadOverview();
    }
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    const model = this.model();
    const auto = model.getProperty("/refresh/auto") as boolean;
    const paused = model.getProperty("/refresh/paused") as boolean;
    if (!auto || paused) {
      return;
    }
    const intervalMs = model.getProperty("/refresh/intervalMs") as number;
    this.refreshTimer = window.setInterval(() => {
      const lastRefreshed = model.getProperty("/refresh/lastRefreshed") as string;
      model.setProperty(
        "/refresh/lastRefreshedText",
        OperationsFormatter.relativeTime(lastRefreshed),
      );
      void this.loadOverview();
    }, intervalMs);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer !== undefined) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private applyRefreshInterval(): void {
    const intervalMs = ConfigService.getInstance().getRefreshInterval("dashboardMs", 30_000);
    this.model().setProperty("/refresh/intervalMs", intervalMs);
  }

  // --- Environment awareness (§10) ------------------------------------------

  private applyEnvironment(): void {
    const config = ConfigService.getInstance();
    const environment = config.getEnvironment();
    const tenant = TenantContext.getInstance().getCurrentTenant();
    const kind = environment.kind.toLowerCase();
    this.model().setProperty("/environment", {
      tenantName: tenant?.name ?? "",
      tenantColor: tenant?.displayColor ?? Colors.tenantFallback,
      environmentLabel: environment.label,
      environmentKind: kind,
      accent: DashboardController.environmentAccent(kind),
      show: kind !== "production",
    });
    const view = this.getView();
    if (view !== undefined) {
      if (this.envStyleClass !== "") {
        view.removeStyleClass(this.envStyleClass);
      }
      this.envStyleClass = `opsEnv-${kind}`;
      view.addStyleClass(this.envStyleClass);
    }
  }

  private static environmentAccent(kind: string): string {
    switch (kind) {
      case "production":
        return Colors.semantic.negative;
      case "qa":
      case "quality":
        return Colors.semantic.critical;
      case "testing":
      case "test":
        return Colors.semantic.information;
      case "development":
      case "dev":
        return Colors.semantic.positive;
      default:
        return Colors.semantic.neutral;
    }
  }

  // --- Quick actions (§5) ---------------------------------------------------

  private applyQuickActions(): void {
    const resolved = OPERATIONS_QUICK_ACTIONS.map((action) => ({
      id: action.id,
      title: this.getText(action.titleKey),
      icon: action.icon,
      route: action.route ?? "",
      command: action.command ?? "",
      emphasized: action.emphasized === true,
    }));
    this.model().setProperty("/quickActions", resolved);
  }

  /** Dispatches a quick action (navigate or raise a shell/workspace command). */
  public onQuickAction(event: Event): void {
    const action = this.contextOf<{ route: string; command: string }>(event);
    if (action === undefined) {
      return;
    }
    if (action.route !== "") {
      this.navTo(action.route);
    } else if (action.command === ShellCommands.SwitchTenant) {
      AppEventBus.getInstance().publish("context:shellCommand", {
        command: ShellCommands.SwitchTenant,
      });
    } else if (action.command === "focusSearch") {
      (this.byId("opsSearch") as unknown as { focus(): void } | undefined)?.focus();
    }
  }

  // --- Drill-down navigation ------------------------------------------------

  /** Drills into the module behind a health widget (§3). */
  public onHealthWidgetPress(event: Event): void {
    const widget = this.contextOf<HealthWidget>(event);
    const route = widget === undefined ? undefined : HEALTH_DRILLDOWN[widget.id];
    if (route !== undefined) {
      this.navTo(route);
    }
  }

  /** Opens Message Monitoring for an interface card (§9). */
  public onInterfacePress(event: Event): void {
    const iface = this.contextOf<InterfaceSummary>(event);
    if (iface !== undefined) {
      this.navTo("messageMonitoring");
    }
  }

  /** Opens the module a timeline event belongs to (§8). */
  public onTimelinePress(event: Event): void {
    const timelineEvent = this.contextOf<TimelineEvent>(event);
    if (timelineEvent === undefined) {
      return;
    }
    const route =
      timelineEvent.kind === "queue"
        ? "jmsQueue"
        : timelineEvent.kind === "certificate"
          ? "certificateSecurityCenter"
          : timelineEvent.kind === "alert"
            ? "alertNotification"
            : "messageMonitoring";
    this.navTo(route);
  }

  // --- Timeline filtering (§8) ----------------------------------------------

  /** Filters the timeline by event kind. */
  public onTimelineFilterChange(event: Event): void {
    const key =
      (event.getParameter("item" as never) as { getKey(): string } | undefined)?.getKey() ?? "all";
    this.model().setProperty("/timelineFilter", key);
    const binding = (this.byId("opsTimelineList") as List | undefined)?.getBinding("items");
    if (binding !== undefined && "filter" in binding) {
      const filters = key === "all" ? [] : [new Filter("kind", FilterOperator.EQ, key)];
      (binding as unknown as { filter(f: Filter[]): void }).filter(filters);
    }
  }

  // --- Search (§6) ----------------------------------------------------------

  /** Runs the operations search across every domain. */
  public async onSearch(event: Event): Promise<void> {
    const query = ((event.getParameter("query" as never) as string | undefined) ?? "").trim();
    const model = this.model();
    model.setProperty("/search/query", query);
    if (query === "") {
      model.setProperty("/search/result", null);
      return;
    }
    model.setProperty("/search/busy", true);
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();
    try {
      const result = await this.service.search(query, this.searchAbort.signal);
      model.setProperty("/search/result", result);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/search/busy", false);
    }
  }

  /** Clears the search results. */
  public onClearSearch(): void {
    this.model().setProperty("/search/result", null);
    this.model().setProperty("/search/query", "");
  }

  /** Opens Message Monitoring from a message search hit. */
  public onOpenMessages(): void {
    this.navTo("messageMonitoring");
  }

  /** Opens JMS Queues from a queue search hit. */
  public onOpenQueues(): void {
    this.navTo("jmsQueue");
  }

  /** Opens the Certificate & Security Center from a certificate search hit. */
  public onOpenCertificates(): void {
    this.navTo("certificateSecurityCenter");
  }

  /** Opens Message Monitoring from a runtime search hit. */
  public onOpenRuntime(): void {
    this.navTo("messageMonitoring");
  }

  /** Opens the Alerts module (system status / notifications). */
  public onOpenAlerts(): void {
    this.navTo("alertNotification");
  }

  // --- Favorites & sections -------------------------------------------------

  /** Toggles the Operations workspace as a favorite (§1). */
  public onToggleFavorite(): void {
    const favorite = this.favorites.toggleFavoriteWorkspace("operations");
    this.model().setProperty("/favorite", favorite);
  }

  /** Refreshes a single section (§4) — reloads the whole overview in one round trip. */
  public onSectionRefresh(): void {
    void this.loadOverview();
  }

  /** Toggles a section to/from fullscreen (§4). */
  public onSectionFullscreen(event: Event): void {
    const panel = DashboardController.panelOf(event.getSource());
    panel?.toggleStyleClass("opsSectionFullscreen");
  }

  /** Exports a section's data to CSV (§4). */
  public onSectionExport(event: Event): void {
    const section = DashboardController.customData(event.getSource(), "section");
    const overview = this.model().getProperty("/overview") as OperationsOverview | null;
    if (overview === null) {
      return;
    }
    if (section === "interfaces") {
      ExportHelper.exportCsv(
        overview.topInterfaces,
        [
          { property: "name", label: this.getText("ops.interface.name") },
          { property: "statusText", label: this.getText("ops.interface.status") },
          { property: "messageCount", label: this.getText("ops.interface.messages") },
          { property: "failures", label: this.getText("ops.interface.failures") },
          { property: "averageRuntimeHuman", label: this.getText("ops.interface.avgRuntime") },
        ],
        "operations-interfaces",
      );
    } else if (section === "timeline") {
      ExportHelper.exportCsv(
        overview.timeline,
        [
          { property: "timestamp", label: this.getText("ops.timeline.time") },
          { property: "kind", label: this.getText("ops.timeline.kind") },
          { property: "title", label: this.getText("ops.timeline.title") },
          { property: "description", label: this.getText("ops.timeline.description") },
        ],
        "operations-timeline",
      );
    } else {
      MessageToast.show(this.getText("ops.export.unavailable"));
    }
  }

  // --- Binding formatters (delegated to OperationsFormatter) -----------------

  /** Resolves a dynamic i18n key (health/insight titles) at binding time. */
  public formatI18n(key: string): string {
    return key === "" || key === undefined ? "" : this.getText(key);
  }

  /** Maps a health status to a UI5 value state. */
  public formatHealthState(health: string): string {
    return OperationsFormatter.healthState(health);
  }

  /** Maps a severity to a UI5 value state. */
  public formatSeverityState(severity: string): string {
    return OperationsFormatter.severityState(severity);
  }

  /** Maps a health status to an icon. */
  public formatHealthIcon(health: string): string {
    return OperationsFormatter.healthIcon(health);
  }

  /** Maps a timeline kind to an icon. */
  public formatTimelineIcon(kind: string): string {
    return OperationsFormatter.timelineIcon(kind);
  }

  /** Formats an ISO timestamp as compact relative time. */
  public formatRelativeTime(iso: string): string {
    return OperationsFormatter.relativeTime(iso);
  }

  /** Maps a severity to a timeline indication colour name. */
  public formatSeverityIndication(severity: string): string {
    return OperationsFormatter.severityIndication(severity);
  }

  /** @returns whether a numeric count is greater than zero (for `visible` bindings). */
  public formatHasItems(count: number): boolean {
    return OperationsFormatter.hasItems(count);
  }

  /** Maps a health status to a `sap.m.ValueColor` for numeric tiles. */
  public formatHealthValueColor(health: string): string {
    switch (health) {
      case "healthy":
        return "Good";
      case "warning":
        return "Critical";
      case "critical":
        return "Error";
      default:
        return "Neutral";
    }
  }

  /** Maps a severity to a `sap.m.ValueColor` for numeric tiles. */
  public formatSeverityValueColor(severity: string): string {
    switch (severity) {
      case "critical":
      case "error":
        return "Error";
      case "warning":
        return "Critical";
      default:
        return "Neutral";
    }
  }

  // --- Helpers --------------------------------------------------------------

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
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

  private static panelOf(source: object): Control | undefined {
    let current = source as { getParent?(): object | undefined } | undefined;
    while (current !== undefined) {
      const meta = (current as { getMetadata?(): { getName(): string } }).getMetadata?.();
      if (meta?.getName() === "sap.m.Panel") {
        return current as unknown as Control;
      }
      current = current.getParent?.() as { getParent?(): object | undefined } | undefined;
    }
    return undefined;
  }

  private static customData(source: object, key: string): string {
    const holder = source as { data?(k: string): unknown };
    const value = holder.data?.(key);
    return typeof value === "string" ? value : "";
  }
}
