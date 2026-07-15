import CreationFlowController from "./CreationFlowController";
import { buildRouteKey, parseIdocControlRecord } from "./idocParser";
import { buildQueueName } from "./queueBuilder";
import type { RouteWizardPrefillState } from "./RouteDeepLink";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CoeRouterService from "../../service/coeRouter/CoeRouterService";
import RouteWizardModel, {
  type AdvancedState,
  type IdocState,
  type TargetState,
} from "../../model/coeRouter/RouteWizardModel";
import type {
  RouteAgreementCheck,
  RouteDeployRequest,
} from "../../service/coeRouter/CoeRouterTypes";

/**
 * Controller for the CoE Route Wizard workspace (spec §4/§5 — "Create JMS + Common Router
 * Connection").
 *
 * A `sap.m.Wizard` abstracts: paste an IDoc control record → extract partners (client-side
 * `DOMParser`, case-preserving) → check for agreement collisions → configure the target route and
 * advanced options → deploy, which creates the route's Partner Directory parameters. Consumes
 * **only** `/api/v1/coe-router` (composed entirely from the Operations Engine); it never talks to the
 * SDK or knows an Integration Suite endpoint.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRouter
 */
export default class RouteWizardController extends CreationFlowController {
  private readonly service = new CoeRouterService();
  private checkAbort: AbortController | undefined;

  /** Lifecycle hook: installs the view model. */
  public onInit(): void {
    this.setModel(new RouteWizardModel(), "view");
  }

  /** Lifecycle hook: aborts any in-flight agreement check. */
  public onExit(): void {
    this.checkAbort?.abort();
  }

  /**
   * Deep-link entry point (Creation Hub's `onRouteMatched`, e.g. from the Global Partner Dashboard's
   * "Edit" action on a decoded JMS route): pre-fills every field from an existing route and runs the
   * agreement check in the background so the step indicators already show resolved — no configuration
   * is written; the developer still reviews each step and must explicitly click Deploy.
   */
  public applyDeepLinkPrefill(state: RouteWizardPrefillState): void {
    if (state.flow !== "jmsEntry" || state.targetPid === undefined) {
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

  /**
   * Parses the pasted EDI_DC40 control record and extracts the six identifiers (case preserved), then
   * derives the 6-part route key. Handles both `IDOCTYP` and the shorter `IDOCTP` tag spelling.
   */
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
    // A re-parse invalidates any earlier collision result.
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
    // An edit invalidates any earlier collision result (it was checked against the old identifiers).
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

  // --- Step 2: Agreement collision check -----------------------------------------

  /** Runs the agreement collision check for the parsed IDoc + intended target partner. */
  public async onCheckAgreement(): Promise<void> {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const target = model.getProperty("/target") as TargetState;
    if (target.targetPid.trim() === "") {
      MessageToast.show(this.getText("coeRouter.check.targetRequired"));
      return;
    }
    model.setProperty("/busy", true);
    this.checkAbort?.abort();
    this.checkAbort = new AbortController();
    try {
      const check = await this.service.checkAgreement(
        {
          sndprn: idoc.sndprn,
          rcvprn: idoc.rcvprn,
          mestyp: idoc.mestyp,
          targetPid: target.targetPid.trim(),
        },
        this.checkAbort.signal,
      );
      model.setProperty("/collision", check);
      if (check.track === "ruleset") {
        MessageBox.warning(
          this.getText("coeRouter.check.rulesetDetected", [
            check.existingTargetPid ?? "",
            check.rulesetKey ?? "",
          ]),
          { title: this.getText("coeRouter.check.rulesetDetected.title") },
        );
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

  // --- Step 4: Deploy ------------------------------------------------------------

  /** Deploys the route (creates its Partner Directory parameters) after a confirmation. */
  public onDeploy(): void {
    MessageBox.confirm(this.getText("coeRouter.deploy.confirm.text"), {
      title: this.getText("coeRouter.deploy.confirm.title"),
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
      const result = await this.service.deployRoute(this.buildDeployRequest());
      model.setProperty("/deployResult", result);
      MessageToast.show(
        this.getText(result.allSucceeded ? "coeRouter.deploy.success" : "coeRouter.deploy.partial"),
      );
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private buildDeployRequest(): RouteDeployRequest {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const target = model.getProperty("/target") as TargetState;
    const advanced = model.getProperty("/advanced") as AdvancedState;
    const collision = model.getProperty("/collision") as RouteAgreementCheck | null;

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
      track: collision?.track ?? "normal",
      rulesetKey: collision?.rulesetKey,
      customMapping: advanced.customMapping.enabled ? advanced.customMapping : undefined,
      alerting: advanced.alerting.to.trim() !== "" ? advanced.alerting : undefined,
      optimization: RouteWizardController.optimizationChanged(advanced)
        ? advanced.optimization
        : undefined,
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
