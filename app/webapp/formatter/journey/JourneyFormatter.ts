import type {
  JourneyCategory,
  JourneyErrorKind,
  JourneyOutcome,
  JourneyStage,
  JourneyStageKind,
  JourneyStageState,
  NextAction,
  NextActionCode,
  TransactionJourney,
} from "../../service/journey/JourneyTypes";

/** Resolves an i18n key with optional placeholders. */
export type Translate = (key: string, args?: (string | number)[]) => string;

/** Where an action's button navigates: a router target and its parameters. */
export interface ActionLink {
  readonly route: string;
  readonly parameters?: Record<string, unknown>;
  /** i18n key of the button text. */
  readonly labelKey: string;
}

const STAGE_ICON: Readonly<Record<JourneyStageKind, string>> = {
  sender: "sap-icon://it-system",
  router: "sap-icon://split",
  jms: "sap-icon://inbox",
  tpmProcessing: "sap-icon://combine",
  tpmDelivery: "sap-icon://shipping-status",
  business: "sap-icon://process",
  receiver: "sap-icon://it-host",
};

const STATE_ICON: Readonly<Record<JourneyStageState, string>> = {
  done: "sap-icon://sys-enter-2",
  failed: "sap-icon://error",
  active: "sap-icon://pending",
  pending: "sap-icon://circle-task",
};

const STATE_VALUE: Readonly<Record<JourneyStageState, string>> = {
  done: "Success",
  failed: "Error",
  active: "Information",
  pending: "None",
};

const OUTCOME_ICON: Readonly<Record<JourneyOutcome, string>> = {
  completed: "sap-icon://sys-enter-2",
  inProgress: "sap-icon://pending",
  stuck: "sap-icon://alert",
  failed: "sap-icon://error",
  unknown: "sap-icon://question-mark",
};

const ACTION_ICON: Readonly<Record<NextActionCode, string>> = {
  none: "sap-icon://sys-enter-2",
  wait: "sap-icon://lateness",
  retry: "sap-icon://redo",
  chooseQueue: "sap-icon://inbox",
  checkPartnerDirectory: "sap-icon://chain-link",
  fixMapping: "sap-icon://edit",
  checkReceiver: "sap-icon://connected",
  checkCredentials: "sap-icon://locked",
  investigate: "sap-icon://inspection",
  resendFromSender: "sap-icon://outbox",
};

/**
 * Pure formatting for the transaction journey: stage icons and states, the headline sentence,
 * diagnosis and next-action texts, and where each action leads. No UI5 imports beyond types, so it
 * is unit-tested directly; texts come through the `translate` callback (the `journey` bundle).
 */
export default class JourneyFormatter {
  public static stageIcon(kind: JourneyStageKind | undefined): string {
    return kind === undefined ? "sap-icon://circle-task" : STAGE_ICON[kind];
  }

  public static stateIcon(state: JourneyStageState | undefined): string {
    return state === undefined ? STATE_ICON.pending : STATE_ICON[state];
  }

  /** `ObjectStatus.state` of a stage. */
  public static stateValue(state: JourneyStageState | undefined): string {
    return state === undefined ? "None" : STATE_VALUE[state];
  }

  /** "Done", "Stopped here", "Parked", "In progress", "Not reached". */
  public static stateText(stage: JourneyStage | undefined, t: Translate): string {
    if (stage === undefined) {
      return "";
    }
    if (stage.parked) {
      return t("state.parked");
    }
    return t(`state.${stage.state}`);
  }

  /** The stage's heading, e.g. "Common IDoc Router". */
  public static stageTitle(kind: JourneyStageKind | undefined, t: Translate): string {
    return kind === undefined ? "" : t(`stage.${kind}`);
  }

  /** The stage's main line: what passed through (a partner, queue, flow), or a fallback. */
  public static stagePrimary(stage: JourneyStage | undefined, t: Translate): string {
    if (stage === undefined) {
      return "";
    }
    switch (stage.kind) {
      case "router":
        return stage.detail ? t("name.router", [stage.detail]) : t("name.router.unknown");
      case "tpmProcessing":
        return stage.detail ?? t("name.tpmProcessing.unknown");
      case "tpmDelivery":
        return stage.detail ? t("name.tpmDelivery", [stage.detail]) : t("name.tpmDelivery.unknown");
      default:
        return stage.name !== "" ? stage.name : t(`name.${stage.kind}.unknown`);
    }
  }

  /** A second line where the stage has one: the sender's adapter, the receiver's acknowledgement. */
  public static stageSecondary(stage: JourneyStage | undefined, t: Translate): string {
    if (stage?.detail === undefined || stage.detail === "") {
      return "";
    }
    if (stage.kind === "sender") {
      return t("detail.sender", [stage.detail]);
    }
    if (stage.kind === "receiver") {
      return t("detail.receiver", [stage.detail]);
    }
    return "";
  }

  /** "3 processing logs · 2 failed". Empty for a stage without logs. */
  public static runsText(stage: JourneyStage | undefined, t: Translate): string {
    const count = stage?.mplIds.length ?? 0;
    if (stage === undefined || count === 0) {
      return "";
    }
    const runs = t(count === 1 ? "runs.one" : "runs.many", [count]);
    return stage.failedRuns > 0 ? t("runs.withFailures", [runs, stage.failedRuns]) : runs;
  }

  /** The headline: where the transaction is and how it ended up. */
  public static headline(journey: TransactionJourney | undefined | null, t: Translate): string {
    if (!journey) {
      return "";
    }
    const { diagnosis } = journey;
    const current = journey.stages.find((stage) => stage.current);
    const stageTitle = JourneyFormatter.stageTitle(current?.kind ?? diagnosis.stage, t);
    switch (diagnosis.outcome) {
      case "completed":
        return journey.receiver !== ""
          ? t("outcome.completed", [journey.receiver])
          : t("outcome.completed.noReceiver");
      case "inProgress":
        return t("outcome.inProgress", [stageTitle]);
      case "stuck":
        return current?.parked
          ? t("outcome.stuck.parked", [stageTitle, current.parked.queueName])
          : t("outcome.stuck.overdue", [stageTitle]);
      case "failed":
        return t("outcome.failed", [stageTitle]);
      default:
        return t("outcome.unknown");
    }
  }

  /** "ORDERS05 · S4_LA → SFDC". */
  public static subline(journey: TransactionJourney | undefined | null, t: Translate): string {
    if (!journey) {
      return "";
    }
    const parties = `${journey.sender || t("name.sender.unknown")} → ${
      journey.receiver || t("name.receiver.unknown")
    }`;
    return [journey.document, parties].filter((part) => part !== undefined && part !== "").join(" · ");
  }

  public static outcomeIcon(outcome: JourneyOutcome | undefined): string {
    return outcome === undefined ? OUTCOME_ICON.unknown : OUTCOME_ICON[outcome];
  }

  /** `MessageStrip.type` for the outcome. */
  public static outcomeType(outcome: JourneyOutcome | undefined): string {
    switch (outcome) {
      case "completed":
        return "Success";
      case "failed":
        return "Error";
      case "stuck":
        return "Warning";
      default:
        return "Information";
    }
  }

  /** What the error most likely means, in plain words. */
  public static errorKindText(kind: JourneyErrorKind | undefined, t: Translate): string {
    return kind === undefined ? "" : t(`errorKind.${kind}`);
  }

  public static actionIcon(code: NextActionCode | undefined): string {
    return code === undefined ? "sap-icon://hint" : ACTION_ICON[code];
  }

  public static actionTitle(
    action: NextAction | undefined,
    category: JourneyCategory | undefined,
    t: Translate,
  ): string {
    if (action === undefined) {
      return "";
    }
    return t(JourneyFormatter.actionKey(action.code, category, "title"));
  }

  public static actionText(
    action: NextAction | undefined,
    journey: TransactionJourney | undefined | null,
    t: Translate,
  ): string {
    if (action === undefined) {
      return "";
    }
    const key = JourneyFormatter.actionKey(action.code, journey?.category, "text");
    switch (action.code) {
      case "retry":
        return t(key, [action.queueName ?? "", action.target ?? ""]);
      case "resendFromSender":
        return t(key, [journey?.sender || t("name.sender.unknown")]);
      default:
        return t(key);
    }
  }

  /** Where the action's button goes; `undefined` when the action has nothing to open. */
  public static actionLink(
    action: NextAction | undefined,
    journey: TransactionJourney | undefined | null,
  ): ActionLink | undefined {
    if (action === undefined || !journey) {
      return undefined;
    }
    switch (action.code) {
      case "retry":
      case "chooseQueue":
        return {
          route: "failedTransactions",
          parameters: {
            "?query": { category: journey.category, search: action.jmsMessageId ?? "" },
          },
          labelKey: "go.failedTransactions",
        };
      case "checkPartnerDirectory":
        return { route: "coePartnersRoutes", labelKey: "go.partners" };
      case "fixMapping":
      case "checkReceiver":
      case "checkCredentials":
      case "investigate":
        if (journey.category === "b2b" && action.interchangeId !== undefined) {
          return {
            route: "reportServer",
            parameters: { interchangeId: action.interchangeId },
            labelKey: "go.interchange",
          };
        }
        return action.mplId === undefined
          ? undefined
          : { route: "messageMonitoring", parameters: { mplId: action.mplId }, labelKey: "go.log" };
      default:
        return undefined;
    }
  }

  /** Time since an instant, e.g. "2 h 5 min" or "40 min"; empty when unknown. */
  public static elapsed(iso: string | undefined, now: Date = new Date()): string {
    if (iso === undefined || iso === "") {
      return "";
    }
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
    if (Number.isNaN(minutes)) {
      return "";
    }
    if (minutes < 1) {
      return "< 1 min";
    }
    const days = Math.floor(minutes / 1_440);
    const hours = Math.floor((minutes % 1_440) / 60);
    const rest = minutes % 60;
    if (days > 0) {
      return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
    }
    if (hours > 0) {
      return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
    }
    return `${rest} min`;
  }

  /** B2B fixes are made in TPM, so some actions have a B2B wording. */
  private static actionKey(
    code: NextActionCode,
    category: JourneyCategory | undefined,
    part: "title" | "text",
  ): string {
    const b2bSpecific: readonly NextActionCode[] = ["fixMapping", "resendFromSender"];
    return category === "b2b" && b2bSpecific.includes(code)
      ? `action.${code}.b2b.${part}`
      : `action.${code}.${part}`;
  }
}
