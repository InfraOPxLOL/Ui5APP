/**
 * A transaction's journey as the backend reports it (`GET /api/v1/report-server/journey`): the
 * business stages it passed through, where it is now or stuck, and the suggested next actions.
 * Mirrors `srv/src/operations/dto/JourneyDto.ts`.
 */

export type JourneyCategory = "b2b" | "nonB2b";

export type JourneyStageKind =
  | "sender"
  | "router"
  | "jms"
  | "tpmProcessing"
  | "tpmDelivery"
  | "business"
  | "receiver";

export type JourneyStageState = "done" | "failed" | "active" | "pending";

export interface JourneyParking {
  readonly queueName: string;
  readonly jmsMessageId: string;
  readonly parkedAt: string;
  readonly retryCount: number;
  readonly retryTarget?: string;
}

export interface JourneyStage {
  readonly kind: JourneyStageKind;
  readonly name: string;
  readonly detail?: string;
  readonly state: JourneyStageState;
  readonly current: boolean;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly mplIds: readonly string[];
  readonly failedRuns: number;
  readonly parked?: JourneyParking;
}

export type JourneyOutcome = "completed" | "inProgress" | "stuck" | "failed" | "unknown";

export type JourneyErrorKind =
  | "partnerDirectory"
  | "mapping"
  | "connectivity"
  | "authorization"
  | "duplicate"
  | "unknown";

export interface JourneyDiagnosis {
  readonly outcome: JourneyOutcome;
  readonly stage?: JourneyStageKind;
  readonly since?: string;
  readonly errorText?: string;
  readonly errorKind?: JourneyErrorKind;
  readonly failedRuns: number;
  readonly overdue: boolean;
}

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
  readonly queueName?: string;
  readonly jmsMessageId?: string;
  readonly target?: string;
  readonly mplId?: string;
  readonly interchangeId?: string;
}

export interface TransactionJourney {
  readonly correlationId: string;
  readonly category: JourneyCategory;
  readonly interchangeId?: string;
  readonly sender: string;
  readonly receiver: string;
  readonly document?: string;
  readonly businessFlow?: string;
  readonly startedAt?: string;
  readonly lastActivityAt?: string;
  readonly stages: readonly JourneyStage[];
  readonly diagnosis: JourneyDiagnosis;
  readonly actions: readonly NextAction[];
}

/** What identifies the transaction: exactly one field. `id` lets the backend work out which kind. */
export interface JourneyRef {
  readonly id?: string;
  readonly correlationId?: string;
  readonly mplId?: string;
  readonly interchangeId?: string;
}
