import CreationFlowController from "./CreationFlowController";
import { buildRouteKey, parseIdocControlRecord } from "./idocParser";
import { buildQueueName } from "./queueBuilder";
import type { RouteWizardPrefillState } from "./RouteDeepLink";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CoeRouterService from "../../service/coeRouter/CoeRouterService";
import JmsRouterModel, { type CombinedRouterState } from "../../model/coeRouter/JmsRouterModel";
import type { AdvancedState, IdocState, TargetState } from "../../model/coeRouter/RouteWizardModel";
import type {
  CombinedAgreementCheck,
  CombinedDeployRequest,
} from "../../service/coeRouter/CoeRouterTypes";

/**
 * Controller for the combined "Create JMS + Common Router Connection" flow (spec §4, Tile 1 — the
 * marquee CoE surface). A `sap.m.Wizard` abstracts: paste an IDoc control record → extract identifiers
 * → check *both* the JMS and Common Router agreement tracks → configure the JMS destination + Common
 * Router package + advanced options → deploy, which writes both parameter sets against one route key.
 * Consumes **only** `/api/v1/coe-router/combined/*`; it never talks to the SDK.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRouter
 */
export default class JmsRouterWizardController extends CreationFlowController {
  private readonly service = new CoeRouterService();
  private checkAbort: AbortController | undefined;

  /** Lifecycle hook: installs the view model. */
  public onInit(): void {
    this.setModel(new JmsRouterModel(), "view");
  }

  /** Lifecycle hook: aborts any in-flight agreement check. */
  public onExit(): void {
    this.checkAbort?.abort();
  }

  /**
   * Deep-link entry point (Creation Hub's `onRouteMatched`, e.g. from the Global Partner Dashboard's
   * "Edit" action when a decoded route has both a JMS and a Router leg on the same Partner ID):
   * pre-fills every field from the existing route and runs the combined agreement check in the
   * background — no configuration is written; the developer still reviews each step and must
   * explicitly click Deploy.
   */
  public applyDeepLinkPrefill(state: RouteWizardPrefillState): void {
    if (state.flow !== "jmsRouter" || state.targetPid === undefined || state.routerPid === undefined) {
      return;
    }
    const model = this.model();
    const idoc: IdocState = { raw: "", ...state.idoc, routeKey: buildRouteKey(state.idoc) };
    model.setProperty("/idoc", idoc);
    model.setProperty("/idocParsed", true);
    model.setProperty("/target", {
      targetPid: state.targetPid,
      targetQueue: state.targetQueue ?? "",
      endpointUri: state.endpointUri ?? "/",
    });
    model.setProperty("/router", { routerPid: state.routerPid });
    if (state.advanced !== undefined) {
      const current = model.getProperty("/advanced") as AdvancedState;
      model.setProperty("/advanced", {
        customMapping: state.advanced.customMapping ?? current.customMapping,
        alerting: state.advanced.alerting ?? current.alerting,
        optimization: state.advanced.optimization ?? current.optimization,
      });
    }
    void this.onCheckAgreement();
  }

  // --- Step 1: Ingress -----------------------------------------------------------

  /** Parses the pasted EDI_DC40 control record and derives the route key (shared parser). */
  public onParseIdoc(): void {
    const model = this.model();
    const raw = (model.getProperty("/idoc/raw") as string).trim();
    const result = parseIdocControlRecord(raw);
    if (!result.ok) {
      model.setProperty("/idocParsed", false);
      model.setProperty("/parseError", this.getText(`coeRouter.parse.${result.error}`));
      return;
    }
    const idoc: IdocState = { raw, ...result.idoc };
    model.setProperty("/idoc", idoc);
    model.setProperty("/parseError", "");
    model.setProperty("/idocParsed", true);
    model.setProperty("/collision", null);
  }

  /**
   * Recomputes the route key live as the developer edits any extracted identifier by hand — either
   * correcting a parsed value or typing a route directly without ever pasting a control record. Step 1
   * validates once SNDPRN/RCVPRN/MESTYP are all non-empty.
   */
  public onIdentifierEdited(): void {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    model.setProperty("/idoc/routeKey", buildRouteKey(idoc));
    const complete =
      idoc.sndprn.trim() !== "" && idoc.rcvprn.trim() !== "" && idoc.mestyp.trim() !== "";
    model.setProperty("/idocParsed", complete);
    if (complete) {
      model.setProperty("/parseError", "");
    }
    model.setProperty("/collision", null);
  }

  /**
   * Composes the shared `Common_JMS_ID_{region}_{priority}` queue-name convention from the Region +
   * Priority Queue Builder's selections and writes it into the Target Architecture Queue field.
   */
  public onBuildQueueName(): void {
    const model = this.model();
    const region = model.getProperty("/queueBuilder/region") as string;
    const priority = model.getProperty("/queueBuilder/priority") as string;
    model.setProperty("/target/targetQueue", buildQueueName(region, priority));
  }

  // --- Step 2: Combined agreement check -------------------------------------------

  /** Runs both the JMS and Common Router agreement checks for the parsed IDoc + intended targets. */
  public async onCheckAgreement(): Promise<void> {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const target = model.getProperty("/target") as TargetState;
    const router = model.getProperty("/router") as CombinedRouterState;
    if (target.targetPid.trim() === "" || router.routerPid.trim() === "") {
      MessageToast.show(this.getText("jmsRouter.check.bothRequired"));
      return;
    }
    model.setProperty("/busy", true);
    this.checkAbort?.abort();
    this.checkAbort = new AbortController();
    try {
      const check = await this.service.checkCombinedAgreement(
        {
          sndprn: idoc.sndprn,
          rcvprn: idoc.rcvprn,
          mestyp: idoc.mestyp,
          targetPid: target.targetPid.trim(),
          routerPid: router.routerPid.trim(),
        },
        this.checkAbort.signal,
      );
      model.setProperty("/collision", check);
      if (check.jms.track === "ruleset" || check.router.track === "ruleset") {
        const lines: string[] = [];
        if (check.jms.track === "ruleset") {
          lines.push(
            this.getText("jmsRouter.check.rulesetDetected.jmsLine", [
              check.jms.existingTargetPid ?? "",
              check.jms.rulesetKey ?? "",
            ]),
          );
        }
        if (check.router.track === "ruleset") {
          lines.push(
            this.getText("jmsRouter.check.rulesetDetected.routerLine", [
              check.router.existingTargetPid ?? "",
              check.router.rulesetKey ?? "",
            ]),
          );
        }
        lines.push(this.getText("jmsRouter.check.rulesetDetected.suffix"));
        MessageBox.warning(lines.join(" "), {
          title: this.getText("coeRouter.check.rulesetDetected.title"),
        });
      }
    } catch (error) {
      if (!this.checkAbort.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!this.checkAbort.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  // --- Step 4: Deploy --------------------------------------------------------------

  /** Deploys the combined route (creates both parameter sets) after a confirmation. */
  public onDeploy(): void {
    MessageBox.confirm(this.getText("jmsRouter.deploy.confirm.text"), {
      title: this.getText("jmsRouter.deploy.confirm.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.deploy();
        }
      },
    });
  }

  private async deploy(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const result = await this.service.deployJmsAndRouter(this.buildDeployRequest());
      model.setProperty("/deployResult", result);
      MessageToast.show(
        this.getText(result.allSucceeded ? "jmsRouter.deploy.success" : "jmsRouter.deploy.partial"),
      );
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private buildDeployRequest(): CombinedDeployRequest {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const target = model.getProperty("/target") as TargetState;
    const router = model.getProperty("/router") as CombinedRouterState;
    const advanced = model.getProperty("/advanced") as AdvancedState;
    const collision = model.getProperty("/collision") as CombinedAgreementCheck | null;

    return {
      idoc: {
        sndprn: idoc.sndprn,
        rcvprn: idoc.rcvprn,
        mestyp: idoc.mestyp,
        idoctyp: idoc.idoctyp,
        sndpor: idoc.sndpor,
        rcvpor: idoc.rcvpor,
      },
      targetPid: target.targetPid.trim(),
      targetQueue: target.targetQueue.trim(),
      endpointUri: target.endpointUri.trim(),
      jmsTrack: collision?.jms.track ?? "normal",
      jmsRulesetKey: collision?.jms.rulesetKey,
      customMapping: advanced.customMapping.enabled ? advanced.customMapping : undefined,
      alerting: advanced.alerting.to.trim() !== "" ? advanced.alerting : undefined,
      optimization: JmsRouterWizardController.optimizationChanged(advanced)
        ? advanced.optimization
        : undefined,
      routerPid: router.routerPid.trim(),
      routerTrack: collision?.router.track ?? "normal",
      routerRulesetKey: collision?.router.rulesetKey,
    };
  }

  /** Only persist optimization defaults when the developer actually changed something. */
  private static optimizationChanged(advanced: AdvancedState): boolean {
    const o = advanced.optimization;
    return o.sync || o.forceCacheRefresh || o.priority !== "P2";
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
