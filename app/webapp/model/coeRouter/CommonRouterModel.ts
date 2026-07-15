import JSONModel from "sap/ui/model/json/JSONModel";
import type { IdocState } from "./RouteWizardModel";
import type {
  RouteAgreementCheck,
  RouteDeployResult,
} from "../../service/coeRouter/CoeRouterTypes";

/** The Common Router target configuration gathered in the flow. */
export interface RouterTargetState {
  /** The Common Router package PID that owns the route→target mapping. */
  routerPid: string;
  /** The final destination partner the route key resolves to. */
  finalTargetPid: string;
}

/** Shape of the Common Router flow view model. */
export interface CommonRouterState {
  busy: boolean;
  parseError: string;
  idocParsed: boolean;
  idoc: IdocState;
  router: RouterTargetState;
  collision: RouteAgreementCheck | null;
  deployResult: RouteDeployResult | null;
}

/**
 * The single view model for the "Create Common Router Only" flow (spec §4). Owned by the flow
 * controller and exposed under the `view` model name — mirrors {@link RouteWizardModel}, minus the
 * JMS queue/endpoint and advanced tabs.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRouter
 */
export default class CommonRouterModel extends JSONModel {
  public constructor() {
    const initial: CommonRouterState = {
      busy: false,
      parseError: "",
      idocParsed: false,
      idoc: {
        raw: "",
        sndprn: "",
        rcvprn: "",
        mestyp: "",
        idoctyp: "",
        sndpor: "",
        rcvpor: "",
        routeKey: "",
      },
      router: { routerPid: "", finalTargetPid: "" },
      collision: null,
      deployResult: null,
    };
    super(initial);
  }
}
