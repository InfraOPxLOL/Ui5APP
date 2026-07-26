import RuleEditorHostController from "../coeRuleBuilder/RuleEditorHost.controller";
import NavContainer from "sap/m/NavContainer";
import type ManagedObject from "sap/ui/base/ManagedObject";
import type Event from "sap/ui/base/Event";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import type { RulesetFollowUp } from "../../service/coeRouter/CoeRouterTypes";

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
  /** Navigates back to the Creation Hub launcher page (the NavContainer's initial page). */
  public onNavBackToHub(): void {
    this.findNavContainer()?.back();
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

  /** Walks up the control tree to the enclosing {@link sap.m.NavContainer}, if any. */
  private findNavContainer(): NavContainer | undefined {
    let control: ManagedObject | undefined = this.getView() ?? undefined;
    while (control !== undefined && !(control instanceof NavContainer)) {
      control = control.getParent() ?? undefined;
    }
    return control instanceof NavContainer ? control : undefined;
  }
}
