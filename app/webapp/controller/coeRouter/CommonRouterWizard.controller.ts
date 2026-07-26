import CreationFlowController from "./CreationFlowController";
import { buildRouteKey, parseIdocControlRecord } from "./idocParser";
import type { RouteWizardPrefillState } from "./RouteDeepLink";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CoeRouterService from "../../service/coeRouter/CoeRouterService";
import RuleBuilderService from "../../service/coeRuleBuilder/RuleBuilderService";
import { blankEditor } from "../../model/coeRuleBuilder/RuleEditorState";
import CommonRouterModel, { type RouterTargetState } from "../../model/coeRouter/CommonRouterModel";
import type { IdocState } from "../../model/coeRouter/RouteWizardModel";
import type {
  RouteAgreementCheck,
  RouterDeployRequest,
} from "../../service/coeRouter/CoeRouterTypes";

/**
 * Controller for the "Create Common Router Only" flow (spec §4). A `sap.m.Wizard` abstracts: paste an
 * IDoc control record → extract identifiers → check the Common Router agreement → configure the router
 * package + final target → deploy, which registers the route→target mapping under the shared router.
 * Consumes **only** `/api/v1/coe-router/router/*`; it never talks to the SDK.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRouter
 */
export default class CommonRouterWizardController extends CreationFlowController {
  private readonly service = new CoeRouterService();
  private readonly ruleService = new RuleBuilderService();
  private checkAbort: AbortController | undefined;

  /** Lifecycle hook: installs the view model. */
  public onInit(): void {
    this.setModel(new CommonRouterModel(), "view");
  }

  /** Lifecycle hook: aborts any in-flight agreement check. */
  public onExit(): void {
    this.checkAbort?.abort();
  }

  /**
   * Deep-link entry point (Creation Hub's `onRouteMatched`, e.g. from the Global Partner Dashboard's
   * "Edit" action on a decoded Router route): pre-fills every field from an existing route and runs
   * the agreement check in the background — no configuration is written; the developer still reviews
   * each step and must explicitly click Deploy.
   */
  public applyDeepLinkPrefill(state: RouteWizardPrefillState): void {
    if (state.flow !== "routerOnly" || state.routerPid === undefined) {
      return;
    }
    const model = this.model();
    const idoc: IdocState = { raw: "", ...state.idoc, routeKey: buildRouteKey(state.idoc) };
    model.setProperty("/idoc", idoc);
    model.setProperty("/idocParsed", true);
    model.setProperty("/router", {
      routerPid: state.routerPid,
      finalTargetPid: state.finalTargetPid ?? "",
    });
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

  // --- Step 2: Router agreement check --------------------------------------------

  /** Runs the Common Router agreement check for the parsed IDoc + intended router package. */
  public async onCheckAgreement(): Promise<void> {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const router = model.getProperty("/router") as RouterTargetState;
    if (router.routerPid.trim() === "") {
      MessageToast.show(this.getText("commonRouter.check.routerRequired"));
      return;
    }
    model.setProperty("/busy", true);
    this.checkAbort?.abort();
    this.checkAbort = new AbortController();
    try {
      const check = await this.service.checkRouterAgreement(
        {
          sndprn: idoc.sndprn,
          rcvprn: idoc.rcvprn,
          mestyp: idoc.mestyp,
          routerPid: router.routerPid.trim(),
        },
        this.checkAbort.signal,
      );
      model.setProperty("/collision", check);
      if (check.track === "ruleset") {
        this.seedRuleStep(check);
        MessageBox.warning(
          this.getText("commonRouter.check.rulesetDetected", [
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

  // --- Step 3: Deploy ------------------------------------------------------------

  /** Deploys the Common Router route (creates its Partner Directory parameters) after a confirmation. */
  public onDeploy(): void {
    MessageBox.confirm(this.getText("commonRouter.deploy.confirm.text"), {
      title: this.getText("commonRouter.deploy.confirm.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.deploy();
        }
      },
    });
  }

  private async deploy(): Promise<void> {
    const model = this.model();
    const ruleEnabled = model.getProperty("/ruleStepEnabled") as boolean;
    if (ruleEnabled) {
      const resolved = this.resolveRuleForSave();
      if (resolved.problem !== undefined) {
        MessageToast.show(resolved.problem);
        return;
      }
    }
    model.setProperty("/busy", true);
    try {
      const result = await this.service.deployCommonRouter(this.buildDeployRequest());
      model.setProperty("/deployResult", result);
      const ruleSaved = ruleEnabled ? await this.saveDisambiguationRule() : true;
      MessageToast.show(
        this.getText(
          result.allSucceeded && ruleSaved
            ? "commonRouter.deploy.success"
            : "commonRouter.deploy.partial",
        ),
      );
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /**
   * Seeds the Rule step for a Common Router ruleset collision: registry PID = the router agreement
   * store; rule name + target-routing = the final target this route resolves to.
   */
  private seedRuleStep(check: RouteAgreementCheck): void {
    const model = this.model();
    const router = model.getProperty("/router") as RouterTargetState;
    const idoc = model.getProperty("/idoc") as IdocState;
    const candidate = router.finalTargetPid.trim();
    const editor = blankEditor(check.agreementStorePid);
    editor.id = candidate;
    editor.ruleset.targetRouting = { targetPid: candidate, routeKey: idoc.routeKey };
    model.setProperty("/ruleEditor", editor);
    model.setProperty("/ruleStepEnabled", true);
    this.refreshXCastRows();
  }

  /** Saves the authored disambiguation rule after the router deploy created its `RULESET_` entry. */
  private async saveDisambiguationRule(): Promise<boolean> {
    const resolved = this.resolveRuleForSave();
    if (resolved.rule === undefined) {
      return false;
    }
    const editor = this.currentEditor();
    try {
      await this.ruleService.save({ pid: editor.pid, id: editor.id.trim(), rule: resolved.rule });
      return true;
    } catch (error) {
      this.getErrorHandler().handle(error);
      return false;
    }
  }

  private buildDeployRequest(): RouterDeployRequest {
    const model = this.model();
    const idoc = model.getProperty("/idoc") as IdocState;
    const router = model.getProperty("/router") as RouterTargetState;
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
      routerPid: router.routerPid.trim(),
      finalTargetPid: router.finalTargetPid.trim(),
      track: collision?.track ?? "normal",
      rulesetKey: collision?.rulesetKey,
    };
  }
}
