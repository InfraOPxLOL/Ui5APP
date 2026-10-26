import type { InterchangeDetailDto } from "../dto/B2bDto.js";
import type { MessageSummary } from "../dto/MessageDto.js";
import type {
  JourneyDiagnosis,
  JourneyOutcome,
  JourneyParking,
  JourneyStage,
  JourneyStageKind,
  JourneyStageState,
  TransactionJourney,
} from "../dto/JourneyDto.js";
import type {
  TransactionDetail,
  TransactionStatusCategory,
  TransactionStep,
} from "../dto/TransactionDto.js";
import { NextActionAdvisor } from "./NextActionAdvisor.js";
import { TransactionAnalyzer } from "./TransactionAnalyzer.js";

/** A transaction left at an active stage for longer than this is overdue. */
export const OVERDUE_MINUTES = 30;

/** A parked message and the stage whose dead-letter queue holds it. */
export interface StageParking extends JourneyParking {
  readonly stage: JourneyStageKind;
}

/** An error text and the processing log it was recorded against, when known. */
export interface JourneyError {
  readonly messageId: string | undefined;
  readonly text: string;
}

export interface NonB2bJourneyInput {
  readonly transaction: TransactionDetail;
  readonly parked: readonly StageParking[];
  readonly errors: readonly JourneyError[];
  /** Whether the JMS framework is in use: the router always hands over to it. */
  readonly jmsEnabled: boolean;
  readonly now: Date;
}

export interface B2bJourneyInput {
  readonly correlationId: string;
  /** The TPM processing logs of the transaction (any order); may be empty. */
  readonly runs: readonly MessageSummary[];
  readonly interchange: InterchangeDetailDto | undefined;
  readonly parked: readonly StageParking[];
  readonly errors: readonly JourneyError[];
  readonly now: Date;
}

/** A stage before the current-stage decision is made. */
type DraftStage = Omit<JourneyStage, "current">;

/** Event types of the B2B monitor that mean the interchange reached its receiver. */
const DELIVERED_EVENTS = /^(DELIVERED|SENT|COMPLETED|ACKNOWLEDGED)$/i;
/** TPM flows that deliver to the receiver; every other TPM flow processes the interchange. */
const DELIVERY_FLOW = /receiver/i;

/**
 * Builds a transaction's journey — the business stages it passed through, the one it is at now, and
 * the suggested next action — for a non-B2B transaction (from its analysed correlation chain) or a
 * B2B one (from its TPM processing logs and interchange). Pure: everything it needs is passed in.
 */
export class JourneyBuilder {
  public static nonB2b(input: NonB2bJourneyInput): TransactionJourney {
    const { transaction } = input;
    const steps = transaction.steps;
    const routerSteps = steps.filter((step) => step.framework === "COMMON_IDOC_ROUTER");
    const jmsSteps = steps.filter((step) => step.framework === "JMS_FRAMEWORK");
    const businessSteps = steps.filter((step) => step.role === "business");
    const parkedAt = (kind: JourneyStageKind): StageParking | undefined =>
      input.parked.find((parking) => parking.stage === kind);

    const drafts: DraftStage[] = [
      JourneyBuilder.draft("sender", transaction.sender, undefined, "done", steps.slice(0, 1)),
    ];
    if (routerSteps.length > 0) {
      const parked = parkedAt("router");
      const state: JourneyStageState =
        parked !== undefined
          ? "failed"
          : transaction.router?.stage === "routed"
            ? "done"
            : transaction.router?.stage === "failed"
              ? "failed"
              : "active";
      drafts.push(
        JourneyBuilder.draft("router", "", transaction.router?.inbound, state, routerSteps, parked),
      );
    }
    if (jmsSteps.length > 0 || (routerSteps.length > 0 && input.jmsEnabled)) {
      const parked = parkedAt("jms");
      let state: JourneyStageState = "pending";
      if (parked !== undefined) {
        state = "failed";
      } else if (jmsSteps.length > 0) {
        switch (transaction.jms?.stage) {
          case "delivered":
            state = "done";
            break;
          case "failed":
            state = "failed";
            break;
          default:
            state = "active";
        }
      }
      drafts.push(
        JourneyBuilder.draft(
          "jms",
          transaction.jms?.queue ?? parked?.retryTarget ?? "",
          undefined,
          state,
          jmsSteps,
          parked,
        ),
      );
    }
    const business = businessSteps.at(-1);
    const businessState: JourneyStageState =
      business === undefined ? "pending" : JourneyBuilder.stateOf(business.statusCategory);
    drafts.push(
      JourneyBuilder.draft(
        "business",
        transaction.businessFlow ?? "",
        undefined,
        businessState,
        businessSteps,
      ),
    );
    drafts.push(
      JourneyBuilder.draft(
        "receiver",
        transaction.receiver,
        undefined,
        businessState === "done" ? "done" : "pending",
        [],
      ),
    );
    // A transaction whose frameworks are all done but whose business flow has not run yet is on
    // its way to that flow.
    JourneyBuilder.markNextActive(drafts);

    return JourneyBuilder.finish({
      correlationId: transaction.correlationId,
      category: "nonB2b",
      interchangeId: undefined,
      sender: transaction.sender,
      receiver: transaction.receiver,
      document: transaction.messageType,
      businessFlow: transaction.businessFlow,
      startedAt: transaction.startedAt,
      lastActivityAt: transaction.lastActivityAt,
      drafts,
      errors: input.errors,
      now: input.now,
    });
  }

  public static b2b(input: B2bJourneyInput): TransactionJourney {
    const interchange = input.interchange?.interchange;
    const runs = [...input.runs].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const toStep = (run: MessageSummary): Pick<
      TransactionStep,
      "messageId" | "startTime" | "endTime" | "statusCategory"
    > => ({
      messageId: run.messageId,
      startTime: run.startTime,
      endTime: run.endTime,
      statusCategory: TransactionAnalyzer.category(run.status),
    });
    const deliveryRuns = runs.filter((run) => DELIVERY_FLOW.test(run.integrationFlow)).map(toStep);
    const processingRuns = runs
      .filter((run) => !DELIVERY_FLOW.test(run.integrationFlow))
      .map(toStep);
    const parkedProcessing = input.parked.find((parking) => parking.stage === "tpmProcessing");
    const parkedDelivery = input.parked.find((parking) => parking.stage === "tpmDelivery");

    const overall: TransactionStatusCategory =
      interchange?.statusCategory ??
      (runs.length === 0
        ? "unknown"
        : TransactionAnalyzer.category((runs.at(-1) as MessageSummary).status));
    const delivered =
      overall === "success" ||
      (input.interchange?.events ?? []).some((event) => DELIVERED_EVENTS.test(event.eventType));
    const deliveryReached = delivered || deliveryRuns.length > 0 || parkedDelivery !== undefined;

    let processing: JourneyStageState;
    if (parkedProcessing !== undefined) {
      processing = "failed";
    } else if (deliveryReached) {
      processing = "done";
    } else if (processingRuns.length > 0) {
      // A completed processing run with a failed interchange means the delivery failed (below).
      processing = JourneyBuilder.stateOf((processingRuns.at(-1) as TransactionStep).statusCategory);
    } else {
      processing = overall === "error" ? "failed" : overall === "unknown" ? "pending" : "active";
    }

    let delivery: JourneyStageState;
    if (parkedDelivery !== undefined) {
      delivery = "failed";
    } else if (delivered) {
      delivery = "done";
    } else if (deliveryRuns.length > 0) {
      delivery = JourneyBuilder.stateOf((deliveryRuns.at(-1) as TransactionStep).statusCategory);
    } else if (processing === "done") {
      delivery = overall === "error" ? "failed" : "active";
    } else {
      delivery = "pending";
    }

    const senderName =
      interchange?.sender.tradingPartnerName ??
      interchange?.sender.communicationPartnerName ??
      runs.find((run) => run.sender !== "")?.sender ??
      "";
    const receiverName =
      interchange?.receiver.tradingPartnerName ??
      interchange?.receiver.communicationPartnerName ??
      runs.find((run) => run.receiver !== "")?.receiver ??
      "";
    const standard = interchange?.sender.documentStandard ?? interchange?.receiver.documentStandard;
    const type =
      interchange?.sender.messageType ??
      interchange?.receiver.messageType ??
      runs.find((run) => run.messageType !== undefined)?.messageType;
    const document = [standard, type].filter((part) => part !== undefined && part !== "").join(" ");

    const drafts: DraftStage[] = [
      {
        ...JourneyBuilder.draft("sender", senderName, interchange?.sender.adapterType, "done", []),
        startedAt: interchange?.startedAt ?? runs[0]?.startTime,
      },
      JourneyBuilder.draft(
        "tpmProcessing",
        "",
        interchange?.interchangeName,
        processing,
        processingRuns,
        parkedProcessing,
      ),
      JourneyBuilder.draft(
        "tpmDelivery",
        "",
        interchange?.receiver.adapterType,
        delivery,
        deliveryRuns,
        parkedDelivery,
      ),
      {
        ...JourneyBuilder.draft(
          "receiver",
          receiverName,
          interchange?.receiverFunctionalAckStatus,
          delivery === "done" ? "done" : "pending",
          [],
        ),
        endedAt: delivery === "done" ? interchange?.endedAt : undefined,
      },
    ];

    return JourneyBuilder.finish({
      correlationId: input.correlationId,
      category: "b2b",
      interchangeId: interchange?.id,
      sender: senderName,
      receiver: receiverName,
      document: document === "" ? undefined : document,
      businessFlow: undefined,
      startedAt: interchange?.startedAt ?? runs[0]?.startTime,
      lastActivityAt:
        interchange?.endedAt ??
        runs.at(-1)?.endTime ??
        runs.at(-1)?.startTime ??
        interchange?.startedAt,
      drafts,
      errors: input.errors,
      now: input.now,
    });
  }

  /** Picks the current stage, diagnoses the outcome and asks the advisor for next actions. */
  private static finish(parts: {
    readonly correlationId: string;
    readonly category: TransactionJourney["category"];
    readonly interchangeId: string | undefined;
    readonly sender: string;
    readonly receiver: string;
    readonly document: string | undefined;
    readonly businessFlow: string | undefined;
    readonly startedAt: string | undefined;
    readonly lastActivityAt: string | undefined;
    readonly drafts: readonly DraftStage[];
    readonly errors: readonly JourneyError[];
    readonly now: Date;
  }): TransactionJourney {
    const failedIndex = parts.drafts.findIndex((stage) => stage.state === "failed");
    const activeIndex = parts.drafts.reduce(
      (found, stage, index) => (stage.state === "active" ? index : found),
      -1,
    );
    const currentIndex = failedIndex >= 0 ? failedIndex : activeIndex;
    const stages: JourneyStage[] = parts.drafts.map((stage, index) => ({
      ...stage,
      current: index === currentIndex,
    }));
    const current = stages[currentIndex];

    const lastActivity = parts.lastActivityAt ?? current?.endedAt ?? current?.startedAt;
    const overdue =
      current?.state === "active" &&
      lastActivity !== undefined &&
      parts.now.getTime() - new Date(lastActivity).getTime() > OVERDUE_MINUTES * 60_000;

    let outcome: JourneyOutcome;
    if (stages.some((stage) => stage.parked !== undefined)) {
      outcome = "stuck";
    } else if (current?.state === "failed") {
      outcome = "failed";
    } else if (current?.state === "active") {
      outcome = overdue ? "stuck" : "inProgress";
    } else if (stages.at(-1)?.state === "done") {
      outcome = "completed";
    } else {
      outcome = "unknown";
    }

    const stageErrors =
      current === undefined
        ? []
        : parts.errors.filter(
            (error) => error.messageId !== undefined && current.mplIds.includes(error.messageId),
          );
    // Errors without a processing log are recorded on the transaction itself (the B2B interchange's
    // own error) and describe the problem best; then the current stage's latest; then any.
    const transactionError = parts.errors.find((error) => error.messageId === undefined);
    const errorText =
      outcome === "completed" || outcome === "inProgress"
        ? undefined
        : (transactionError ?? stageErrors.at(-1) ?? parts.errors[0])?.text;

    const diagnosis: JourneyDiagnosis = {
      outcome,
      stage: current?.kind,
      since: current?.parked?.parkedAt ?? current?.endedAt ?? current?.startedAt ?? lastActivity,
      errorText,
      errorKind: NextActionAdvisor.classifyError(errorText),
      failedRuns: current?.failedRuns ?? 0,
      overdue,
    };

    return {
      correlationId: parts.correlationId,
      category: parts.category,
      interchangeId: parts.interchangeId,
      sender: parts.sender,
      receiver: parts.receiver,
      document: parts.document,
      businessFlow: parts.businessFlow,
      startedAt: parts.startedAt,
      lastActivityAt: parts.lastActivityAt,
      stages,
      diagnosis,
      actions: NextActionAdvisor.advise(parts.category, stages, diagnosis, parts.interchangeId),
    };
  }

  /** When every stage before a pending one is done, the transaction is on its way to it. */
  private static markNextActive(drafts: DraftStage[]): void {
    const firstPending = drafts.findIndex((stage) => stage.state === "pending");
    if (
      firstPending > 0 &&
      drafts.slice(0, firstPending).every((stage) => stage.state === "done") &&
      drafts[firstPending]?.kind !== "receiver"
    ) {
      drafts[firstPending] = { ...(drafts[firstPending] as DraftStage), state: "active" };
    }
  }

  private static draft(
    kind: JourneyStageKind,
    name: string,
    detail: string | undefined,
    state: JourneyStageState,
    steps: readonly Pick<TransactionStep, "messageId" | "startTime" | "endTime" | "statusCategory">[],
    parked?: StageParking,
  ): DraftStage {
    const last = steps.at(-1);
    return {
      kind,
      name,
      detail: detail === "" ? undefined : detail,
      state,
      startedAt: steps[0]?.startTime,
      endedAt: state === "done" || state === "failed" ? (last?.endTime ?? last?.startTime) : undefined,
      mplIds: steps.map((step) => step.messageId),
      failedRuns: steps.filter((step) => step.statusCategory === "error").length,
      parked:
        parked === undefined
          ? undefined
          : {
              queueName: parked.queueName,
              jmsMessageId: parked.jmsMessageId,
              parkedAt: parked.parkedAt,
              retryCount: parked.retryCount,
              retryTarget: parked.retryTarget,
            },
    };
  }

  private static stateOf(category: TransactionStatusCategory): JourneyStageState {
    switch (category) {
      case "success":
        return "done";
      case "error":
        return "failed";
      default:
        return "active";
    }
  }
}
