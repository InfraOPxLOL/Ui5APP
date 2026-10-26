import type {
  JourneyCategory,
  JourneyDiagnosis,
  JourneyErrorKind,
  JourneyStage,
  JourneyStageKind,
  NextAction,
  NextActionCode,
} from "../dto/JourneyDto.js";

/**
 * Error texts → the likely kind of problem. Checked in order; the first match wins, so the more
 * specific readings (credentials, Partner Directory) come before the broad ones (connectivity).
 */
const ERROR_PATTERNS: readonly (readonly [JourneyErrorKind, RegExp])[] = [
  ["duplicate", /\bduplicate\b/i],
  ["authorization", /\b40[13]\b|unauthori[sz]ed|forbidden|credential|certificate|\bssl\b|handshake|auth(entication)? failed/i],
  [
    "partnerDirectory",
    /partner ?directory|\bPD\b|string ?parameter|route key|no (route|agreement|routing entry)|agreement not found|QUEUE_JMS_|ROUTE_JMS_/i,
  ],
  [
    "mapping",
    /mapping|segment|xpath|xslt|validation|schema|unexpected element|parse|missing (mandatory|required)|value mapping/i,
  ],
  [
    "connectivity",
    /time ?out|timed out|connection|connect|unavailable|unreachable|refused|socket|\b5\d\d\b|no response|not received/i,
  ],
];

/** Failed runs at one stage after which retrying again is not the first thing to try. */
const REPEATED_FAILURES = 3;

/** What a fix looks like when the error says nothing more specific, per stage. */
const DEFAULT_FIX: Readonly<Record<JourneyStageKind, NextActionCode>> = {
  sender: "investigate",
  router: "checkPartnerDirectory",
  jms: "investigate",
  tpmProcessing: "fixMapping",
  tpmDelivery: "checkReceiver",
  business: "investigate",
  receiver: "checkReceiver",
};

const FIX_FOR_ERROR: Readonly<Record<JourneyErrorKind, NextActionCode | undefined>> = {
  partnerDirectory: "checkPartnerDirectory",
  mapping: "fixMapping",
  connectivity: "checkReceiver",
  authorization: "checkCredentials",
  duplicate: "investigate",
  unknown: undefined,
};

/**
 * Suggests what to do next with a transaction, from where it stopped and why. Deterministic rules,
 * not guesses: a parked message can be retried (after fixing the cause when the error points at
 * configuration or data, or when retries keep failing), a failed message that is not parked must be
 * fixed and sent again, a message on its way needs only patience unless it is overdue.
 */
export class NextActionAdvisor {
  /** Reads an error text for the kind of problem it describes. */
  public static classifyError(text: string | undefined): JourneyErrorKind | undefined {
    if (text === undefined || text.trim() === "") {
      return undefined;
    }
    return ERROR_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
  }

  /**
   * The suggested actions, most useful first; exactly one is `primary`.
   * @param category B2B or non-B2B.
   * @param stages the journey's stages.
   * @param diagnosis the outcome and its cause.
   * @param interchangeId the B2B interchange, when known.
   */
  public static advise(
    category: JourneyCategory,
    stages: readonly JourneyStage[],
    diagnosis: JourneyDiagnosis,
    interchangeId: string | undefined,
  ): NextAction[] {
    const current = stages.find((stage) => stage.current);
    const mplId = current?.mplIds.at(-1);
    const evidence = { mplId, interchangeId };

    if (diagnosis.outcome === "completed") {
      return [{ code: "none", primary: true }];
    }
    if (diagnosis.outcome === "unknown" || current === undefined) {
      return [{ code: "investigate", primary: true, ...evidence }];
    }

    const fix = NextActionAdvisor.fixFor(category, current.kind, diagnosis.errorKind);
    const parked = current.parked;
    if (parked !== undefined) {
      const retry: NextAction =
        parked.retryTarget === undefined
          ? {
              code: "chooseQueue",
              primary: false,
              queueName: parked.queueName,
              jmsMessageId: parked.jmsMessageId,
            }
          : {
              code: "retry",
              primary: false,
              queueName: parked.queueName,
              jmsMessageId: parked.jmsMessageId,
              target: parked.retryTarget,
            };
      // A passing glitch (an endpoint briefly down) is worth retrying straight away; a configuration
      // or data error, or retries that keep failing, need the cause fixed first.
      const retryFirst =
        diagnosis.errorKind === "connectivity" && diagnosis.failedRuns < REPEATED_FAILURES;
      const fixFirst =
        !retryFirst &&
        (current.kind === "router" ||
          diagnosis.failedRuns >= REPEATED_FAILURES ||
          (diagnosis.errorKind !== undefined && diagnosis.errorKind !== "unknown"));
      if (fixFirst) {
        return [{ code: fix, primary: true, ...evidence }, retry];
      }
      return NextActionAdvisor.unique([
        { ...retry, primary: true },
        { code: fix, primary: false, ...evidence },
      ]);
    }

    if (diagnosis.outcome === "failed") {
      return NextActionAdvisor.unique([
        { code: fix, primary: true, ...evidence },
        { code: "resendFromSender", primary: false },
      ]);
    }

    // On its way. Overdue means nothing moved for longer than a transaction normally takes.
    if (diagnosis.overdue) {
      return [
        { code: "investigate", primary: true, ...evidence },
        { code: "wait", primary: false },
      ];
    }
    return [{ code: "wait", primary: true }];
  }

  private static fixFor(
    category: JourneyCategory,
    stage: JourneyStageKind,
    errorKind: JourneyErrorKind | undefined,
  ): NextActionCode {
    const byError = errorKind === undefined ? undefined : FIX_FOR_ERROR[errorKind];
    // B2B routing lives in TPM agreements, not the Partner Directory.
    if (category === "b2b" && byError === "checkPartnerDirectory") {
      return "fixMapping";
    }
    // At the router every failure is a routing (Partner Directory) problem unless the error names
    // credentials or connectivity explicitly.
    if (stage === "router" && (byError === undefined || byError === "fixMapping")) {
      return "checkPartnerDirectory";
    }
    return byError ?? DEFAULT_FIX[stage];
  }

  /** Drops a later action that repeats an earlier one's code. */
  private static unique(actions: readonly NextAction[]): NextAction[] {
    const seen = new Set<NextActionCode>();
    return actions.filter((action) => {
      if (seen.has(action.code)) {
        return false;
      }
      seen.add(action.code);
      return true;
    });
  }
}
