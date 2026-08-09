import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import type NavContainer from "sap/m/NavContainer";
import type View from "sap/ui/core/mvc/View";
import type Event from "sap/ui/base/Event";
import { getModuleI18nModel } from "../../core/utils/ModuleI18n";

/** Route name → the tab it should open. Every merged module keeps its original route (§ deep links). */
const TAB_BY_ROUTE: Readonly<Record<string, string>> = {
  coeRouter: "routes",
  coePartnerDashboard: "routes",
  coeRegistry: "registry",
  coeRuleBuilder: "rules",
};

/** Nested view id → the module whose i18n bundle it must resolve `{i18n>…}` against. */
const I18N_BY_VIEW: Readonly<Record<string, string>> = {
  partnersView: "coePartnerDashboard",
  creationView: "coeRouter",
  registryView: "coeRegistry",
  rulesView: "coeRuleBuilder",
};

/**
 * Controller for the consolidated **Partners & Routes** shell.
 *
 * It owns no CoE business logic of its own: it hosts the existing Partner Dashboard, Route Creation
 * Hub, Parameter Registry and Rule Builder views as tabs and does exactly three things —
 * 1. gives each nested view its own i18n bundle (the router-driven hook in `Component` only covers
 *    routed target views, never nested ones);
 * 2. selects the tab matching whichever of the four preserved routes was matched, so every existing
 *    deep link still lands in the right place;
 * 3. swaps the Routes tab between the partner list and the Creation Hub.
 *
 * The nested controllers' own `attachPatternMatched` handlers keep firing unchanged, because those
 * bind to the *route*, not to the view — which is why deep-link-to-edit and the wizards' ruleset
 * follow-up survive this consolidation untouched.
 *
 * @namespace com.middlewareops.integrationportal.controller.coePartnersRoutes
 */
export default class PartnersRoutesController extends BaseController {
  /** Lifecycle hook: seeds the tab state, fixes nested i18n, and listens for the merged routes. */
  public onInit(): void {
    this.setModel(new JSONModel({ selectedTab: "routes", routesPage: "partnersView" }), "view");
    this.applyNestedI18n();
    for (const route of Object.keys(TAB_BY_ROUTE)) {
      this.getRouter()
        .getRoute(route)
        ?.attachPatternMatched((event: Event) => this.onRouteMatched(event));
    }
  }

  /**
   * Attaches each nested view's own module bundle as its `"i18n"` model.
   *
   * Required because `Component.applyModuleI18n` runs off `router.attachRouteMatched` and only sees
   * the routed target view — here, this shell. A nested `XMLView` would otherwise inherit this
   * shell's bundle and render every `{i18n>…}` binding as the literal key, with no error raised.
   */
  private applyNestedI18n(): void {
    for (const [viewId, moduleId] of Object.entries(I18N_BY_VIEW)) {
      (this.byId(viewId) as View | undefined)?.setModel(getModuleI18nModel(moduleId), "i18n");
    }
  }

  /** Opens the tab matching the matched route, so every preserved deep link lands correctly. */
  private onRouteMatched(event: Event): void {
    const routeName = (event.getParameter("name" as never) as string | undefined) ?? "";
    const tab = TAB_BY_ROUTE[routeName];
    if (tab !== undefined) {
      this.model().setProperty("/selectedTab", tab);
    }
    // `coeRouter` is the "create a route" entry point — show the Creation Hub rather than the
    // partner list; every other route (including Partner Dashboard) lands on the partner list.
    this.showRoutesPage(routeName === "coeRouter" ? "creationView" : "partnersView");
  }

  /** Keeps the view model in sync when the user picks a tab directly. */
  public onTabSelect(event: Event): void {
    const key = (event.getParameter("key" as never) as string | undefined) ?? "routes";
    this.model().setProperty("/selectedTab", key);
  }

  /** "Back to Partners" — returns the Routes tab from the Creation Hub to the partner list. */
  public onBackToPartners(): void {
    this.showRoutesPage("partnersView");
  }

  private showRoutesPage(viewId: string): void {
    this.model().setProperty("/routesPage", viewId);
    const nav = this.byId("routesNav") as NavContainer | undefined;
    const target = this.byId(viewId);
    if (nav === undefined || target === undefined) {
      return;
    }
    if (nav.getCurrentPage()?.getId() !== target.getId()) {
      nav.to(target.getId());
    }
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
