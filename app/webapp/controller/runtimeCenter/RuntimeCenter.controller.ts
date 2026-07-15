import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type Event from "sap/ui/base/Event";
import type Table from "sap/m/Table";
import type ListBinding from "sap/ui/model/ListBinding";
import RuntimeCenterService from "../../service/runtimeCenter/RuntimeCenterService";
import RuntimeCenterFormatter from "../../formatter/runtimeCenter/RuntimeCenterFormatter";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import RuntimeCenterModel, {
  initialSelectedArtifact,
} from "../../model/runtimeCenter/RuntimeCenterModel";
import type { RuntimeCenterTabKey } from "../../model/runtimeCenter/RuntimeCenterModel";
import type { CatalogEntry } from "../../service/runtimeCenter/RuntimeCenterTypes";

/**
 * Controller for the Runtime Center (Phase 12).
 *
 * A complete operational workspace for browsing deployed integration flows. Consumes **only**
 * `/api/v1/runtime-center` (itself composed entirely from the Operations Engine's
 * `RuntimeCenterEngine`) — it never talks to the SDK, never knows a runtime artifact entity-set name,
 * holding no business logic of its own beyond orchestration.
 *
 * @namespace com.middlewareops.integrationportal.controller.runtimeCenter
 */
export default class RuntimeCenterController extends BaseController {
  private readonly service = new RuntimeCenterService();
  private catalogAbort: AbortController | undefined;

  /** Lifecycle hook: loads the Integration Catalog. */
  public onInit(): void {
    this.setModel(new RuntimeCenterModel(), "view");
    void this.loadCatalog();
  }

  /** Lifecycle hook: aborts in-flight requests. */
  public onExit(): void {
    this.catalogAbort?.abort();
  }

  /** Manual refresh — reloads the catalog and, if open, the selected artifact's details. */
  public onRefreshPress(): void {
    void this.loadCatalog();
    const artifactId = this.model().getProperty("/selectedArtifact/artifactId") as string;
    if (artifactId !== "") {
      void this.loadSelectedArtifact(artifactId);
    }
  }

  // --- Integration Catalog (§ Integration Catalog) ---------------------------------------------

  private async loadCatalog(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.catalogAbort?.abort();
    this.catalogAbort = new AbortController();
    try {
      const catalog = await this.service.listCatalog(this.catalogAbort.signal);
      model.setProperty("/catalog", catalog);
      model.setProperty("/error", "");
    } catch (error) {
      model.setProperty("/error", this.errorText(error));
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /** Searches the catalog table by flow name. */
  public onCatalogSearch(event: Event): void {
    const query = ((event.getParameter("query" as never) as string | undefined) ?? "").trim();
    this.model().setProperty("/catalogSearch", query);
    this.applyCatalogFilters(query, this.model().getProperty("/catalogStatusFilter") as string);
  }

  /** Applies a health filter (all/healthy/warning/critical) to the catalog table. */
  public onCatalogFilterChange(event: Event): void {
    const key =
      (event.getParameter("item" as never) as { getKey(): string } | undefined)?.getKey() ?? "all";
    this.model().setProperty("/catalogStatusFilter", key);
    this.applyCatalogFilters(this.model().getProperty("/catalogSearch") as string, key);
  }

  private applyCatalogFilters(query: string, healthKey: string): void {
    const binding = (this.byId("runtimeCatalogTable") as Table | undefined)?.getBinding("items") as
      | ListBinding
      | undefined;
    if (binding === undefined) {
      return;
    }
    const filters: Filter[] = [];
    if (query !== "") {
      filters.push(
        new Filter({
          filters: [
            new Filter("name", FilterOperator.Contains, query),
            new Filter("version", FilterOperator.Contains, query),
          ],
          and: false,
        }),
      );
    }
    if (healthKey !== "all") {
      filters.push(new Filter("health", FilterOperator.EQ, healthKey));
    }
    binding.filter(filters);
  }

  /** Opens Integration Details for a selected catalog row. */
  public onCatalogRowPress(event: Event): void {
    const entry = this.contextOf<CatalogEntry>(event);
    if (entry === undefined) {
      return;
    }
    this.model().setProperty("/detailsOpen", true);
    void this.loadSelectedArtifact(entry.artifactId);
  }

  /** Closes the Integration Details panel. */
  public onCloseDetailsPress(): void {
    this.model().setProperty("/detailsOpen", false);
    this.model().setProperty("/selectedArtifact", initialSelectedArtifact());
  }

  // --- Integration Details (§ Integration Details, § Runtime Health, § Deployment Timeline) -----

  private async loadSelectedArtifact(artifactId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/selectedArtifact/artifactId", artifactId);
    model.setProperty("/selectedArtifact/busy", true);
    try {
      const [details, health, timeline] = await Promise.all([
        this.service.getDetails(artifactId),
        this.service.getHealth(artifactId),
        this.service.getDeploymentTimeline(artifactId),
      ]);
      model.setProperty("/selectedArtifact/details", details);
      model.setProperty("/selectedArtifact/health", health);
      model.setProperty("/selectedArtifact/timeline", timeline);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/selectedArtifact/busy", false);
    }
  }

  /** Switches the active Integration Details tab. */
  public onDetailsTabSelect(event: Event): void {
    const key = event.getParameter("key" as never) as string | undefined as
      | RuntimeCenterTabKey
      | undefined;
    if (key !== undefined) {
      this.model().setProperty("/selectedArtifact/activeTab", key);
    }
  }

  /** Redeploys the selected artifact and refreshes its Deployment Timeline/Runtime Health. */
  public async onRedeployPress(): Promise<void> {
    const artifactId = this.model().getProperty("/selectedArtifact/artifactId") as string;
    if (artifactId === "") {
      return;
    }
    try {
      await this.service.redeploy(artifactId);
      MessageToast.show(this.getText("runtimeCenter.timeline.redeployed"));
      await this.loadSelectedArtifact(artifactId);
      await this.loadCatalog();
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  // --- Related Navigation (§ Related Navigation) ------------------------------------------------

  /** Opens Message Investigation. */
  public onOpenMessagesPress(): void {
    this.navTo("messageMonitoring");
  }

  /** Opens Payload Studio for the most recent message on this flow, when one exists. */
  public onOpenPayloadPress(): void {
    const details = this.model().getProperty("/selectedArtifact/details") as {
      recentMessages?: readonly { messageId: string }[];
    } | null;
    const messageId = details?.recentMessages?.[0]?.messageId;
    if (messageId === undefined) {
      MessageToast.show(this.getText("runtimeCenter.related.openPayload"));
      return;
    }
    this.getRouter().navTo("payloadStudio", {
      "?query": { state: DeepLinkHelper.encode({ messageId }) },
    });
  }

  /** Opens the Recovery Center. */
  public onOpenRecoveryPress(): void {
    this.navTo("recoveryCenter");
  }

  /** Opens the Certificate & Security Center. */
  public onOpenCertificatesPress(): void {
    this.navTo("certificateSecurityCenter");
  }

  // --- Binding formatters (delegated to RuntimeCenterFormatter) ----------------------------------

  public formatHealthState(health: string): string {
    return RuntimeCenterFormatter.healthState(health);
  }

  public formatHealthIcon(health: string): string {
    return RuntimeCenterFormatter.healthIcon(health);
  }

  public formatSeverityState(severity: string): string {
    return RuntimeCenterFormatter.severityState(severity);
  }

  public formatHealthScoreState(score: number): string {
    return RuntimeCenterFormatter.healthScoreState(score);
  }

  public formatFailureTrendIcon(trend: string): string {
    return RuntimeCenterFormatter.failureTrendIcon(trend);
  }

  public formatFailureTrendState(trend: string): string {
    return RuntimeCenterFormatter.failureTrendState(trend);
  }

  public formatDeploymentEventIcon(kind: string): string {
    return RuntimeCenterFormatter.deploymentEventIcon(kind);
  }

  public formatDeploymentEventState(kind: string): string {
    return RuntimeCenterFormatter.deploymentEventState(kind);
  }

  public formatDateTime(value: string | undefined): string {
    return RuntimeCenterFormatter.dateTime(value);
  }

  public formatRelative(value: string | undefined): string {
    return RuntimeCenterFormatter.relative(value);
  }

  public formatDuration(millis: number | undefined): string {
    return RuntimeCenterFormatter.duration(millis);
  }

  public formatHasItems(count: number): boolean {
    return RuntimeCenterFormatter.hasItems(count);
  }

  // --- Helpers -----------------------------------------------------------------------------------

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
}
