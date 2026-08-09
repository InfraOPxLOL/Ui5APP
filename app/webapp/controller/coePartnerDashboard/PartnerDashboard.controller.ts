import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import type Event from "sap/ui/base/Event";
import type ListBinding from "sap/ui/model/ListBinding";
import type List from "sap/m/List";
import CoePartnerDashboardService from "../../service/coePartnerDashboard/CoePartnerDashboardService";
import PartnerDashboardModel from "../../model/coePartnerDashboard/PartnerDashboardModel";
import type {
  DecodedJmsRoute,
  DecodedRouterRoute,
  OtherParameter,
  PartnerDetail,
  PartnerSummary,
} from "../../service/coePartnerDashboard/CoePartnerDashboardTypes";
import type {
  DeepLinkAdvanced,
  DeepLinkIdoc,
  RouteWizardPrefillState,
} from "../coeRouter/RouteDeepLink";

/**
 * Controller for the Global Partner Master-Detail Dashboard: a master list of every Partner ID
 * discoverable by scanning both agreement registries (there is no tenant capability to enumerate
 * every Partner ID directly), and a read-only reverse-engineered detail view per partner — its raw
 * `QUEUE_JMS_`/`ROUTE_JMS_`/`ROUTE_` parameters decoded back into structured routes, everything else
 * as flat parameters, and which agreements route here. Consumes **only**
 * `/api/v1/coe-partner-dashboard`.
 *
 * @namespace com.middlewareops.integrationportal.controller.coePartnerDashboard
 */
export default class PartnerDashboardController extends BaseController {
  private readonly service = new CoePartnerDashboardService();
  private partnersAbort: AbortController | undefined;
  private detailAbort: AbortController | undefined;

  /** Lifecycle hook: installs the view model and loads the master list. */
  public onInit(): void {
    this.setModel(new PartnerDashboardModel(), "view");
    void this.loadPartners();
  }

  /** Lifecycle hook: aborts any in-flight requests. */
  public onExit(): void {
    this.partnersAbort?.abort();
    this.detailAbort?.abort();
  }

  /** Reloads the master list (and the currently selected partner's detail, if any). */
  public onRefresh(): void {
    void this.loadPartners();
    const selectedPid = this.model().getProperty("/selectedPid") as string | undefined;
    if (selectedPid !== undefined) {
      void this.loadDetail(selectedPid);
    }
  }

  private async loadPartners(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.partnersAbort?.abort();
    const controller = new AbortController();
    this.partnersAbort = controller;
    try {
      const list = await this.service.listPartners(controller.signal);
      model.setProperty("/partners", [...list.partners]);
      model.setProperty("/partnersLoaded", true);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  /** Filters the master list by Partner ID substring. */
  public onSearchPartners(event: Event): void {
    const query = ((event.getParameter("query" as never) as string | undefined) ?? "").trim();
    const binding = (this.byId("partnerList") as List | undefined)?.getBinding("items") as
      | ListBinding
      | undefined;
    if (binding === undefined) {
      return;
    }
    binding.filter(query === "" ? [] : [new Filter("pid", FilterOperator.Contains, query)]);
  }

  /** Loads the reverse-engineered detail view for the selected partner. */
  public onSelectPartner(event: Event): void {
    const partner = PartnerDashboardController.partnerOf(event);
    if (partner === undefined) {
      return;
    }
    this.model().setProperty("/selectedPid", partner.pid);
    void this.loadDetail(partner.pid);
  }

  private async loadDetail(pid: string): Promise<void> {
    const model = this.model();
    model.setProperty("/detailBusy", true);
    this.detailAbort?.abort();
    const controller = new AbortController();
    this.detailAbort = controller;
    try {
      const detail = await this.service.getPartnerDetail(pid, controller.signal);
      model.setProperty("/detail", detail);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/detailBusy", false);
      }
    }
  }

  private static partnerOf(event: Event): PartnerSummary | undefined {
    const item = event.getParameter("listItem" as never) as
      | { getBindingContext(model?: string): { getObject(): unknown } | null | undefined }
      | undefined;
    return item?.getBindingContext("view")?.getObject() as PartnerSummary | undefined;
  }

  /**
   * Partner-first entry into route creation: opens the Creation Hub with no prefill.
   *
   * Navigates by *route* rather than calling into the hosting shell, so this works identically
   * whether this view is embedded as the Partners & Routes "Routes" tab or opened standalone.
   */
  public onNewRoute(): void {
    this.getRouter().navTo("coeRouter");
  }

  // --- Deep-link into the Route/Router wizards for editing --------------------------------------

  /** Deep-links a decoded JMS route into the matching creation wizard, pre-filled for editing. */
  public onEditJmsRoute(event: Event): void {
    const route = PartnerDashboardController.rowOf<DecodedJmsRoute>(event);
    if (route !== undefined) {
      this.openWizardFor("jms", route);
    }
  }

  /** Deep-links a decoded Router route into the matching creation wizard, pre-filled for editing. */
  public onEditRouterRoute(event: Event): void {
    const route = PartnerDashboardController.rowOf<DecodedRouterRoute>(event);
    if (route !== undefined) {
      this.openWizardFor("router", route);
    }
  }

  /**
   * Builds the deep-link prefill state for a decoded route and navigates into the Creation Hub.
   * When the same route key has both a JMS leg and a Router leg on this Partner ID (an edge case —
   * this PID doubling as both a JMS target and a Router package), prefers the combined
   * "Create JMS + Common Router" flow over the single-purpose one, pre-filling both legs at once.
   */
  private openWizardFor(kind: "jms" | "router", route: DecodedJmsRoute | DecodedRouterRoute): void {
    const detail = this.model().getProperty("/detail") as PartnerDetail | null;
    if (detail === null) {
      return;
    }
    const matchingJms = detail.jmsRoutes.find((r) => r.routeKey === route.routeKey);
    const matchingRouter = detail.routerRoutes.find((r) => r.routeKey === route.routeKey);
    const idoc = PartnerDashboardController.toDeepLinkIdoc(route);

    let state: RouteWizardPrefillState | undefined;
    if (matchingJms !== undefined && matchingRouter !== undefined) {
      state = {
        flow: "jmsRouter",
        idoc,
        targetPid: detail.pid,
        targetQueue: matchingJms.queue,
        endpointUri: matchingJms.endpointUri,
        routerPid: detail.pid,
        advanced: PartnerDashboardController.buildAdvanced(
          detail.otherParameters,
          matchingJms.mappingAddress,
        ),
      };
    } else if (kind === "jms" && matchingJms !== undefined) {
      state = {
        flow: "jmsEntry",
        idoc,
        targetPid: detail.pid,
        targetQueue: matchingJms.queue,
        endpointUri: matchingJms.endpointUri,
        advanced: PartnerDashboardController.buildAdvanced(
          detail.otherParameters,
          matchingJms.mappingAddress,
        ),
      };
    } else if (kind === "router" && matchingRouter !== undefined) {
      state = {
        flow: "routerOnly",
        idoc,
        routerPid: detail.pid,
        finalTargetPid: matchingRouter.finalTargetPid,
      };
    }
    if (state === undefined) {
      return;
    }
    this.getRouter().navTo("coeRouter", {
      "?query": { state: DeepLinkHelper.encode({ ...state }) },
    });
  }

  private static toDeepLinkIdoc(route: {
    readonly idoctyp: string;
    readonly mestyp: string;
    readonly sndpor: string;
    readonly sndprn: string;
    readonly rcvpor: string;
    readonly rcvprn: string;
  }): DeepLinkIdoc {
    // Route parts absent in the original control record decode as "*" (the framework's display
    // convention) — translate back to "" so the wizard's Inputs show blank/placeholder, not a literal "*".
    const clean = (value: string): string => (value === "*" ? "" : value);
    return {
      sndprn: clean(route.sndprn),
      rcvprn: clean(route.rcvprn),
      mestyp: clean(route.mestyp),
      idoctyp: clean(route.idoctyp),
      sndpor: clean(route.sndpor),
      rcvpor: clean(route.rcvpor),
    };
  }

  /** Reconstructs the Advanced tab settings from the partner's flat "other" parameters, when present. */
  private static buildAdvanced(
    otherParameters: readonly OtherParameter[],
    mappingAddress: string | undefined,
  ): DeepLinkAdvanced | undefined {
    const byId = new Map(otherParameters.map((parameter) => [parameter.id, parameter.value]));
    const has = (id: string): boolean => byId.has(id);
    if (
      !has("X-Routing") &&
      mappingAddress === undefined &&
      !has("X-Exception-To") &&
      !has("X-Max-Retries") &&
      !has("X-Priority") &&
      !has("X-Sync") &&
      !has("X-Force-Cache-Refresh")
    ) {
      return undefined;
    }
    return {
      customMapping:
        has("X-Routing") || mappingAddress !== undefined
          ? {
              enabled: byId.get("X-Routing") === "true" || mappingAddress !== undefined,
              condition: byId.get("X-Routing-Condition") === "post" ? "post" : "pre",
              address: mappingAddress ?? "/",
            }
          : undefined,
      alerting:
        has("X-Exception-To") || has("X-Max-Retries")
          ? {
              to: byId.get("X-Exception-To") ?? "",
              cc: byId.get("X-Exception-Cc") ?? "",
              bcc: byId.get("X-Exception-Bcc") ?? "",
              subject: byId.get("X-Exception-Subject") ?? "",
              maxRetries: Number.parseInt(byId.get("X-Max-Retries") ?? "3", 10),
            }
          : undefined,
      optimization:
        has("X-Priority") || has("X-Sync") || has("X-Force-Cache-Refresh")
          ? {
              priority: byId.get("X-Priority") ?? "P2",
              sync: byId.get("X-Sync") === "true",
              forceCacheRefresh: byId.get("X-Force-Cache-Refresh") === "true",
            }
          : undefined,
    };
  }

  private static rowOf<T>(event: Event): T | undefined {
    const source = event.getSource() as unknown as {
      getBindingContext(model?: string): { getObject(): unknown } | null | undefined;
    };
    return source.getBindingContext("view")?.getObject() as T | undefined;
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
