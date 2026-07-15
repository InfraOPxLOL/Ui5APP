import BaseController from "../../core/base/BaseController";
import MessageToast from "sap/m/MessageToast";
import NavContainer from "sap/m/NavContainer";
import HubModel, { type CreationFlowId, type CreationOption } from "../../model/coeRouter/HubModel";
import { Icons } from "../../core/constants/Icons";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import type { RouteWizardPrefillState } from "./RouteDeepLink";
import type Event from "sap/ui/base/Event";
import type View from "sap/ui/core/mvc/View";

/**
 * Controller for the CoE Creation Hub (spec §4 — the launcher that fronts the three route-creation
 * flows). Renders one card per flow and switches the module's {@link sap.m.NavContainer} to the
 * selected flow's nested view. Flows not yet built render as roadmapped cards (no navigation).
 *
 * The hub owns no data of its own — it composes flows that each consume `/api/v1/coe-router`; it
 * never touches a service directly.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRouter
 */
export default class HubController extends BaseController {
  /** Lifecycle hook: builds the launcher cards from the module bundle and installs the deep-link listener. */
  public onInit(): void {
    const model = new HubModel();
    model.setProperty("/options", this.buildOptions());
    this.setModel(model, "view");
    this.getRouter()
      .getRoute("coeRouter")
      ?.attachPatternMatched((event: Event) => this.onRouteMatched(event));
  }

  /**
   * Deep-link entry point (e.g. from the Global Partner Dashboard's "Edit" action on a decoded
   * route): decodes the prefill state, opens the matching flow, then hands the state to that flow
   * controller's `applyDeepLinkPrefill` — every field is pre-filled and validated in the background,
   * but nothing is deployed automatically; the developer still walks the wizard and clicks Deploy.
   */
  private onRouteMatched(event: Event): void {
    const args = event.getParameter("arguments" as never) as { "?query"?: Record<string, string> };
    const state = DeepLinkHelper.decode<RouteWizardPrefillState & Record<string, unknown>>(
      args["?query"]?.state,
    );
    if (state === undefined) {
      return;
    }
    this.openFlowWithPrefill(state);
  }

  private openFlowWithPrefill(state: RouteWizardPrefillState): void {
    const flowView = this.byId(`${state.flow}Flow`) as View | undefined;
    const nav = this.byId("creationNav") as NavContainer | undefined;
    if (flowView === undefined || nav === undefined) {
      return;
    }
    nav.to(flowView.getId());
    const controller = flowView.getController() as unknown as {
      applyDeepLinkPrefill?: (state: RouteWizardPrefillState) => void;
    };
    controller.applyDeepLinkPrefill?.(state);
  }

  /** Assembles the three creation-flow cards, resolving their copy from the module bundle. */
  private buildOptions(): CreationOption[] {
    const option = (flow: CreationFlowId, icon: string, available: boolean): CreationOption => ({
      flow,
      icon,
      available,
      title: this.getText(`hub.${flow}.title`),
      subtitle: this.getText(`hub.${flow}.subtitle`),
      description: this.getText(`hub.${flow}.description`),
      creates: this.getText(`hub.${flow}.creates`),
    });
    return [
      option("jmsEntry", Icons.module.jmsQueue, true),
      option("jmsRouter", Icons.module.coeRouter, true),
      option("routerOnly", Icons.module.coeRegistry, true),
    ];
  }

  /**
   * Opens the selected creation flow inside the module's NavContainer. Roadmapped (not-yet-built)
   * flows surface a short "coming next" toast instead of navigating.
   */
  public onOpenFlow(event: Event): void {
    const option = this.contextObject<CreationOption>(event);
    if (option === undefined) {
      return;
    }
    if (!option.available) {
      MessageToast.show(this.getText("hub.card.comingNextToast"));
      return;
    }
    const flowView = this.byId(`${option.flow}Flow`);
    const nav = this.byId("creationNav") as NavContainer | undefined;
    if (flowView !== undefined && nav !== undefined) {
      nav.to(flowView.getId());
    }
  }

  /** Resolves the `view` model object bound to the pressed card. */
  private contextObject<T>(event: Event): T | undefined {
    const source = event.getSource() as { getBindingContext?: (model: string) => unknown };
    const context = source.getBindingContext?.("view") as { getObject: () => T } | null | undefined;
    return context?.getObject();
  }
}
