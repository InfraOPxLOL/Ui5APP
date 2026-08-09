import RuleEditorHostController from "../coeRuleBuilder/RuleEditorHost.controller";
import NavContainer from "sap/m/NavContainer";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type ManagedObject from "sap/ui/base/ManagedObject";
import type Event from "sap/ui/base/Event";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import CoePartnerDashboardService from "../../service/coePartnerDashboard/CoePartnerDashboardService";
import type { RulesetFollowUp } from "../../service/coeRouter/CoeRouterTypes";

/** One Partner ID suggestion offered under a Target/Final Target PID field. */
export interface PartnerSuggestion {
  readonly pid: string;
  /** Short "N JMS · N Router" agreement summary, shown as the suggestion's secondary text. */
  readonly info: string;
}

/**
 * Shared base for every creation **flow** hosted inside the Creation Hub's {@link sap.m.NavContainer}
 * (spec §4 — the hub launches "Create JMS Entry", "Create JMS + Common Router" and "Create only
 * Common Router" as sibling pages). A flow is a nested view whose page carries a back button that
 * returns to the hub launcher; this base finds the enclosing NavContainer without the flow needing to
 * know the hub's control ids.
 *
 * Extends {@link RuleEditorHostController} so every flow inherits the shared CoE rule editor used by
 * the "Disambiguation Rule" wizard step (bound to `view>/ruleEditor`) — the same editor the standalone
 * Rule Builder hosts — without duplicating any of its field/structural logic.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRouter
 */
export default abstract class CreationFlowController extends RuleEditorHostController {
  private readonly partnerDashboardService = new CoePartnerDashboardService();
  private partnerAbort: AbortController | undefined;

  /** Navigates back to the Creation Hub launcher page (the NavContainer's initial page). */
  public onNavBackToHub(): void {
    this.findNavContainer()?.back();
  }

  /**
   * Loads the known Partner IDs into `view>/partnerSuggestions`, backing the type-ahead on the
   * Target/Final Target PID fields.
   *
   * **These are suggestions, never a closed list.** The tenant exposes no way to enumerate every
   * Partner ID, so this list is *derived* — it contains only PIDs already referenced by an agreement
   * registry (see `coe-partner-dashboard`'s DTO doc comment). A brand-new partner you are onboarding
   * right now legitimately will not appear, which is exactly why the field stays a free-text `Input`
   * with suggestions rather than a `Select`/`ComboBox` that would refuse an unlisted value.
   *
   * Failures are swallowed on purpose: a suggestion list is a convenience, and losing it must never
   * block route creation or raise a dialog over the wizard.
   */
  protected async loadPartnerSuggestions(): Promise<void> {
    this.partnerAbort?.abort();
    this.partnerAbort = new AbortController();
    try {
      const list = await this.partnerDashboardService.listPartners(this.partnerAbort.signal);
      const suggestions: PartnerSuggestion[] = list.partners.map((partner) => ({
        pid: partner.pid,
        info: this.getText("coeRouter.targetPid.agreementSummary", [
          partner.jmsAgreementCount,
          partner.routerAgreementCount,
        ]),
      }));
      (this.getModel("view") as JSONModel).setProperty("/partnerSuggestions", suggestions);
    } catch {
      // Suggestions are optional — leave the list empty and let the operator type the PID freely.
    }
  }

  /**
   * Deep-links from a deploy result's ruleset follow-up (row press) into the Visual Rule Builder,
   * pre-filled with the registry PID + rule name still needing a Binary Parameter rule authored.
   */
  public onOpenRuleBuilder(event: Event): void {
    const source = event.getSource() as { getBindingContext?: (model: string) => unknown };
    const context = source.getBindingContext?.("view") as
      | { getObject: () => RulesetFollowUp }
      | null
      | undefined;
    const followUp = context?.getObject();
    if (followUp === undefined) {
      return;
    }
    this.getRouter().navTo("coeRuleBuilder", {
      "?query": {
        state: DeepLinkHelper.encode({ pid: followUp.storePid, ruleName: followUp.ruleName }),
      },
    });
  }

  /** Aborts an in-flight partner-suggestion load. Call from each flow's `onExit`. */
  protected abortPartnerSuggestions(): void {
    this.partnerAbort?.abort();
  }

  /** Walks up the control tree to the enclosing {@link sap.m.NavContainer}, if any. */
  private findNavContainer(): NavContainer | undefined {
    let control: ManagedObject | undefined = this.getView() ?? undefined;
    while (control !== undefined && !(control instanceof NavContainer)) {
      control = control.getParent() ?? undefined;
    }
    return control instanceof NavContainer ? control : undefined;
  }
}
