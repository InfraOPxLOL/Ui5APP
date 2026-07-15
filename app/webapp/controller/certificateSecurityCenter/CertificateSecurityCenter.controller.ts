import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type Event from "sap/ui/base/Event";
import type Table from "sap/m/Table";
import type ListBinding from "sap/ui/model/ListBinding";
import CertificateSecurityCenterService from "../../service/certificateSecurityCenter/CertificateSecurityCenterService";
import CertificateSecurityCenterFormatter from "../../formatter/certificateSecurityCenter/CertificateSecurityCenterFormatter";
import CertificateSecurityCenterModel, {
  initialSelectedCertificate,
} from "../../model/certificateSecurityCenter/CertificateSecurityCenterModel";
import type {
  CertificateCenterTabKey,
  DetailsTabKey,
} from "../../model/certificateSecurityCenter/CertificateSecurityCenterModel";
import type { CertificateDetail } from "../../service/certificateSecurityCenter/CertificateSecurityCenterTypes";

const EXPIRING_7_DAYS = 7;
const EXPIRING_30_DAYS = 30;

/**
 * Controller for the Certificate & Security Center (Phase 13).
 *
 * A complete operational workspace for certificate health, the Certificate Explorer, Security
 * Materials and per-certificate Timeline. Consumes **only** `/api/v1/certificate-security-center`
 * (itself composed entirely from the Operations Engine's `CertificateSecurityEngine`) — it never
 * talks to the SDK, never knows a `KeystoreEntries` entity-set name, holding no business logic of
 * its own beyond orchestration.
 *
 * @namespace com.middlewareops.integrationportal.controller.certificateSecurityCenter
 */
export default class CertificateSecurityCenterController extends BaseController {
  private readonly service = new CertificateSecurityCenterService();
  private loadAbort: AbortController | undefined;

  /** Lifecycle hook: loads the dashboard, certificate list and security materials. */
  public onInit(): void {
    this.setModel(new CertificateSecurityCenterModel(), "view");
    void this.loadAll();
  }

  /** Lifecycle hook: aborts in-flight requests. */
  public onExit(): void {
    this.loadAbort?.abort();
  }

  /** Manual refresh — reloads everything and, if open, the selected certificate. */
  public onRefreshPress(): void {
    void this.loadAll();
    const alias = this.model().getProperty("/selectedCertificate/alias") as string;
    if (alias !== "") {
      void this.loadSelectedCertificate(alias);
    }
  }

  /** Switches the active section tab. */
  public onTabSelect(event: Event): void {
    const key = event.getParameter("key" as never) as string | undefined as
      | CertificateCenterTabKey
      | undefined;
    if (key !== undefined) {
      this.model().setProperty("/activeTab", key);
    }
  }

  // --- Data loading -----------------------------------------------------------------------------

  private async loadAll(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.loadAbort?.abort();
    this.loadAbort = new AbortController();
    try {
      const [dashboard, certificates, securityMaterials] = await Promise.all([
        this.service.getDashboard(this.loadAbort.signal),
        this.service.listCertificates(this.loadAbort.signal),
        this.service.listSecurityMaterials(this.loadAbort.signal),
      ]);
      model.setProperty("/dashboard", dashboard);
      model.setProperty("/certificates", certificates);
      model.setProperty("/securityMaterials", securityMaterials);
      model.setProperty("/error", "");
    } catch (error) {
      model.setProperty("/error", this.errorText(error));
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  // --- Certificate Explorer (§ Certificate Explorer, § Smart Filters) ----------------------------

  /** Searches the certificate table by alias/owner/issuer. */
  public onExplorerSearch(event: Event): void {
    const query = ((event.getParameter("query" as never) as string | undefined) ?? "").trim();
    this.model().setProperty("/explorerSearch", query);
    this.applyExplorerFilters(query, this.model().getProperty("/smartFilter") as string);
  }

  /** Applies a smart filter (§ Smart Filters). */
  public onSmartFilterChange(event: Event): void {
    const key =
      (event.getParameter("item" as never) as { getKey(): string } | undefined)?.getKey() ?? "all";
    this.model().setProperty("/smartFilter", key);
    this.applyExplorerFilters(this.model().getProperty("/explorerSearch") as string, key);
  }

  private applyExplorerFilters(query: string, smartFilter: string): void {
    const binding = (this.byId("certificateExplorerTable") as Table | undefined)?.getBinding(
      "items",
    ) as ListBinding | undefined;
    if (binding === undefined) {
      return;
    }
    const filters: Filter[] = [];
    if (query !== "") {
      filters.push(
        new Filter({
          filters: [
            new Filter("alias", FilterOperator.Contains, query),
            new Filter("owner", FilterOperator.Contains, query),
            new Filter("issuer", FilterOperator.Contains, query),
          ],
          and: false,
        }),
      );
    }
    switch (smartFilter) {
      case "expiring7":
        filters.push(new Filter("daysRemaining", FilterOperator.BT, 0, EXPIRING_7_DAYS));
        break;
      case "expiring30":
        filters.push(new Filter("daysRemaining", FilterOperator.BT, 0, EXPIRING_30_DAYS));
        break;
      case "expired":
        filters.push(new Filter("daysRemaining", FilterOperator.LT, 0));
        break;
      case "selfSigned":
        filters.push(new Filter("selfSigned", FilterOperator.EQ, true));
        break;
      case "weakAlgorithm":
        filters.push(new Filter("weakAlgorithm", FilterOperator.EQ, true));
        break;
      default:
        break;
    }
    binding.filter(filters);
  }

  /** Opens the Certificate Details panel for a selected row. */
  public onCertificateRowPress(event: Event): void {
    const certificate = this.contextOf<CertificateDetail>(event);
    if (certificate === undefined) {
      return;
    }
    this.model().setProperty("/detailsOpen", true);
    void this.loadSelectedCertificate(certificate.alias);
  }

  /** Closes the Certificate Details panel. */
  public onCloseDetailsPress(): void {
    this.model().setProperty("/detailsOpen", false);
    this.model().setProperty("/selectedCertificate", initialSelectedCertificate());
  }

  // --- Certificate Details / Timeline (§ Certificate Explorer, § Timeline) -----------------------

  private async loadSelectedCertificate(alias: string): Promise<void> {
    const model = this.model();
    model.setProperty("/selectedCertificate/alias", alias);
    model.setProperty("/selectedCertificate/busy", true);
    try {
      const [certificate, timeline] = await Promise.all([
        this.service.getCertificate(alias),
        this.service.getTimeline(alias),
      ]);
      model.setProperty("/selectedCertificate/certificate", certificate);
      model.setProperty("/selectedCertificate/timeline", timeline);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/selectedCertificate/busy", false);
    }
  }

  /** Switches the active Certificate Details tab. */
  public onDetailsTabSelect(event: Event): void {
    const key = event.getParameter("key" as never) as string | undefined as
      | DetailsTabKey
      | undefined;
    if (key !== undefined) {
      this.model().setProperty("/selectedCertificate/activeTab", key);
    }
  }

  /** Flags the selected certificate for renewal (the one real admin action this domain supports). */
  public async onFlagForRenewalPress(): Promise<void> {
    const alias = this.model().getProperty("/selectedCertificate/alias") as string;
    if (alias === "") {
      return;
    }
    try {
      await this.service.flagForRenewal(alias);
      MessageToast.show(this.getText("timeline.flagged"));
      await this.loadSelectedCertificate(alias);
    } catch (error) {
      this.getErrorHandler().handle(error);
    }
  }

  // --- Related Navigation (§ Related Navigation) --------------------------------------------------

  /** Opens the Runtime Center. */
  public onOpenRuntimePress(): void {
    this.navTo("runtimeCenter");
  }

  /** Opens Message Investigation. */
  public onOpenMessagesPress(): void {
    this.navTo("messageMonitoring");
  }

  /** Opens Payload Studio. */
  public onOpenPayloadPress(): void {
    this.navTo("payloadStudio");
  }

  // --- Binding formatters (delegated to CertificateSecurityCenterFormatter) ----------------------

  public formatHealthState(health: string): string {
    return CertificateSecurityCenterFormatter.healthState(health);
  }

  public formatHealthIcon(health: string): string {
    return CertificateSecurityCenterFormatter.healthIcon(health);
  }

  public formatRiskScoreState(riskScore: number): string {
    return CertificateSecurityCenterFormatter.riskScoreState(riskScore);
  }

  public formatSelfSignedText(selfSigned: boolean | undefined): string {
    return CertificateSecurityCenterFormatter.selfSignedText(selfSigned);
  }

  public formatSelfSignedState(selfSigned: boolean | undefined): string {
    return CertificateSecurityCenterFormatter.selfSignedState(selfSigned);
  }

  public formatWeakAlgorithmState(weakAlgorithm: boolean): string {
    return CertificateSecurityCenterFormatter.weakAlgorithmState(weakAlgorithm);
  }

  public formatAvailabilityState(available: boolean): string {
    return CertificateSecurityCenterFormatter.availabilityState(available);
  }

  public formatAvailabilityIcon(available: boolean): string {
    return CertificateSecurityCenterFormatter.availabilityIcon(available);
  }

  public formatTimelineEventIcon(kind: string): string {
    return CertificateSecurityCenterFormatter.timelineEventIcon(kind);
  }

  public formatTimelineEventState(kind: string): string {
    return CertificateSecurityCenterFormatter.timelineEventState(kind);
  }

  public formatReservedText(value: string | undefined): string {
    return CertificateSecurityCenterFormatter.reservedText(value);
  }

  public formatDateTime(value: string | undefined): string {
    return CertificateSecurityCenterFormatter.dateTime(value);
  }

  public formatRelative(value: string | undefined): string {
    return CertificateSecurityCenterFormatter.relative(value);
  }

  public formatHasItems(count: number): boolean {
    return CertificateSecurityCenterFormatter.hasItems(count);
  }

  // --- Helpers -------------------------------------------------------------------------------------

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
