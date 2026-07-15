import JSONModel from "sap/ui/model/json/JSONModel";
import type { IdocState, TargetState, AdvancedState, QueueBuilderState } from "./RouteWizardModel";
import { QUEUE_REGIONS, type RegionOption } from "../../controller/coeRouter/queueBuilder";
import type {
  CombinedAgreementCheck,
  RouteDeployResult,
} from "../../service/coeRouter/CoeRouterTypes";

/** The Common Router half of the combined flow's target configuration. */
export interface CombinedRouterState {
  /** The Common Router package PID (the JMS `targetPid` doubles as its final target). */
  routerPid: string;
}

/** Shape of the combined "Create JMS + Common Router Connection" flow's view model. */
export interface JmsRouterState {
  busy: boolean;
  parseError: string;
  idocParsed: boolean;
  idoc: IdocState;
  target: TargetState;
  queueBuilder: QueueBuilderState;
  router: CombinedRouterState;
  advanced: AdvancedState;
  collision: CombinedAgreementCheck | null;
  deployResult: RouteDeployResult | null;
  priorities: string[];
  regions: RegionOption[];
}

/**
 * The single view model for the combined "Create JMS + Common Router Connection" flow (spec §4, Tile
 * 1). Owned by the flow controller and exposed under the `view` model name — the union of
 * {@link RouteWizardModel}'s JMS state and {@link CommonRouterModel}'s router state, since this flow
 * deploys both write sets against one route key.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRouter
 */
export default class JmsRouterModel extends JSONModel {
  public constructor() {
    const initial: JmsRouterState = {
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
      target: { targetPid: "", targetQueue: "", endpointUri: "/" },
      queueBuilder: { region: "NA", priority: "P2" },
      router: { routerPid: "" },
      advanced: {
        customMapping: { enabled: false, condition: "pre", address: "/" },
        alerting: { to: "", cc: "", bcc: "", subject: "", maxRetries: 3 },
        optimization: {
          priority: "P2",
          sync: false,
          forceCacheRefresh: false,
        },
      },
      collision: null,
      deployResult: null,
      priorities: ["P1", "P2", "P3"],
      regions: [...QUEUE_REGIONS],
    };
    super(initial);
  }
}
