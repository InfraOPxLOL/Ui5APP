/**
 * DTOs for a transaction's journey: the stages one business transaction passes through — sender,
 * Common IDoc Router, JMS framework or TPM, business flow, receiver — where it is now or where it got
 * stuck, and what to do next. Built for business users: stages are business steps, not processing
 * logs. Texts are produced by the UI from the codes here; names (partners, flows, queues) are data.
 */

export type JourneyCategory = "b2b" | "nonB2b";

/** The business step a stage stands for. */
export type JourneyStageKind =
  | "sender"
  | "router"
  | "jms"
  | "tpmProcessing"
  | "tpmDelivery"
  | "business"
  | "receiver";

/** `done` passed · `failed` stopped here · `active` on its way here now · `pending` not reached. */
export type JourneyStageState = "done" | "failed" | "active" | "pending";

/** A message of the transaction parked on a dead-letter queue at this stage. */
export interface JourneyParking {
  readonly queueName: string;
  readonly jmsMessageId: string;
  readonly parkedAt: string;
  readonly retryCount: number;
  /** Where a retry sends it; `undefined` = the operator chooses in Failed Transactions. */
  readonly retryTarget: string | undefined;
}

export interface JourneyStage {
  readonly kind: JourneyStageKind;
  /** What passed through: a partner, system, flow or queue name. Empty when unknown. */
  readonly name: string;
  /** A qualifier: the router's inbound variant, the JMS queue, an acknowledgement status. */
  readonly detail: string | undefined;
  readonly state: JourneyStageState;
  /** The stage the transaction is at now: where it failed, is parked, or is being processed. */
  readonly current: boolean;
  readonly startedAt: string | undefined;
  readonly endedAt: string | undefined;
  /** Processing logs of this stage, oldest first (drill-down). */
  readonly mplIds: readonly string[];
  /** Runs of this stage that failed (repeated failures mean retries are not helping). */
  readonly failedRuns: number;
  readonly parked: JourneyParking | undefined;
}

/** How the transaction ended up. `stuck` = parked on a dead-letter queue or waiting far too long. */
export type JourneyOutcome = "completed" | "inProgress" | "stuck" | "failed" | "unknown";

/** A coarse reading of the error text, so the advice can name the likely fix. */
export type JourneyErrorKind =
  | "partnerDirectory"
  | "mapping"
  | "connectivity"
  | "authorization"
  | "duplicate"
  | "unknown";

export interface JourneyDiagnosis {
  readonly outcome: JourneyOutcome;
  /** The stage that decides the outcome (the current stage), when any. */
  readonly stage: JourneyStageKind | undefined;
  /** Since when the transaction has been at that stage. */
  readonly since: string | undefined;
  readonly errorText: string | undefined;
  readonly errorKind: JourneyErrorKind | undefined;
  /** Failed runs at the current stage. */
  readonly failedRuns: number;
  /** Waiting at an active stage for longer than expected. */
  readonly overdue: boolean;
}

/** A suggested next step. The UI turns the code into text and, where possible, a link. */
export type NextActionCode =
  | "none"
  | "wait"
  | "retry"
  | "chooseQueue"
  | "checkPartnerDirectory"
  | "fixMapping"
  | "checkReceiver"
  | "checkCredentials"
  | "investigate"
  | "resendFromSender";

export interface NextAction {
  readonly code: NextActionCode;
  readonly primary: boolean;
  /** The dead-letter queue and message a retry acts on. */
  readonly queueName?: string;
  readonly jmsMessageId?: string;
  /** Where a retry sends the message. */
  readonly target?: string;
  /** The processing log to open for the evidence. */
  readonly mplId?: string;
  /** The interchange to open (B2B). */
  readonly interchangeId?: string;
}

export interface TransactionJourney {
  readonly correlationId: string;
  readonly category: JourneyCategory;
  readonly interchangeId: string | undefined;
  readonly sender: string;
  readonly receiver: string;
  /** Message type or document (e.g. `ORDERS05`, `ASC-X12 850`). */
  readonly document: string | undefined;
  readonly businessFlow: string | undefined;
  readonly startedAt: string | undefined;
  readonly lastActivityAt: string | undefined;
  readonly stages: readonly JourneyStage[];
  readonly diagnosis: JourneyDiagnosis;
  readonly actions: readonly NextAction[];
}
