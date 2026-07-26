import JSONModel from "sap/ui/model/json/JSONModel";
import { QUEUE_REGIONS, type RegionOption } from "../../controller/coeRouter/queueBuilder";
import { blankEditor, type EditorState } from "../coeRuleBuilder/RuleEditorState";
import type {
  RouteAgreementCheck,
  RouteDeployResult,
} from "../../service/coeRouter/CoeRouterTypes";

/** The six IDoc control-record identifiers extracted in Step 1, the derived route key, and the raw text. */
export interface IdocState {
  raw: string;
  sndprn: string;
  rcvprn: string;
  mestyp: string;
  idoctyp: string;
  sndpor: string;
  rcvpor: string;
  /** The derived 6-part route key `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}` (`*` for missing). */
  routeKey: string;
}

/** The target-route configuration gathered in Steps 2–3. */
export interface TargetState {
  targetPid: string;
  targetQueue: string;
  endpointUri: string;
}

/** Region + Priority Queue Builder selections (composes `Common_JMS_ID_{region}_{priority}`). */
export interface QueueBuilderState {
  region: string;
  priority: string;
}

/** The advanced (IconTabBar) settings — spec §5. Max retries is capped at 5 (framework limit). */
export interface AdvancedState {
  customMapping: { enabled: boolean; condition: "pre" | "post"; address: string };
  alerting: { to: string; cc: string; bcc: string; subject: string; maxRetries: number };
  optimization: {
    priority: string;
    sync: boolean;
    forceCacheRefresh: boolean;
  };
}

/** Shape of the CoE Route Wizard view model. */
export interface RouteWizardState {
  busy: boolean;
  parseError: string;
  idocParsed: boolean;
  idoc: IdocState;
  target: TargetState;
  queueBuilder: QueueBuilderState;
  advanced: AdvancedState;
  collision: RouteAgreementCheck | null;
  deployResult: RouteDeployResult | null;
  priorities: string[];
  regions: RegionOption[];
  /** Whether the developer is authoring a disambiguation rule in the Rule step (auto-on for a ruleset collision). */
  ruleStepEnabled: boolean;
  /** The shared rule editor's working state (hosted by `RuleEditorHostController` at `/ruleEditor`). */
  ruleEditor: EditorState;
}

/**
 * The single view model for the CoE Route Wizard workspace (architecture §15). Owned by the
 * controller and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRouter
 */
export default class RouteWizardModel extends JSONModel {
  public constructor() {
    const initial: RouteWizardState = {
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
      ruleStepEnabled: false,
      ruleEditor: blankEditor(""),
    };
    super(initial);
  }
}
