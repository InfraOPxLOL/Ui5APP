import type {
  InterchangeSummary,
  MessageRecoveryOutcome,
  RecoveryPathStep,
} from "../../operations/dto/index.js";
import type { Severity } from "../../operations/transform/index.js";

/** Which TPM dead-letter queue a message sits on, in business words. */
export type DeadLetterKind = "processing" | "receiver" | "other";

/** The interchange facts shown next to a failed message. */
export interface FailedInterchangeRef {
  readonly id: string;
  readonly overallStatus: string;
  readonly senderPartner: string | undefined;
  readonly receiverPartner: string | undefined;
  readonly documentStandard: string | undefined;
  readonly messageType: string | undefined;
  readonly controlNumber: string | undefined;
}

/** One message sitting on a TPM dead-letter queue. */
export interface FailedTransactionRow {
  /** JMS message id — the key retries act on. */
  readonly messageId: string;
  readonly queueName: string;
  readonly deadLetterKind: DeadLetterKind;
  /** The main queue a retry moves the message back to (`dlqRecoveryMap`). */
  readonly targetQueue: string | undefined;
  readonly failedAt: string;
  /** Broker redelivery count for this JMS message. */
  readonly jmsRetryCount: number;
  readonly mplId: string | undefined;
  readonly correlationId: string | undefined;
  readonly sender: string | undefined;
  readonly receiver: string | undefined;
  readonly messageType: string | undefined;
  readonly applicationId: string | undefined;
  readonly expiresAt: string | undefined;
  /** Linked interchange; `undefined` when not linked or B2B monitoring is unavailable. */
  readonly interchange: FailedInterchangeRef | undefined;
}

/** Message count per dead-letter queue. `error` is set when the queue could not be read. */
export interface DeadLetterQueueCount {
  readonly queueName: string;
  readonly deadLetterKind: DeadLetterKind;
  readonly targetQueue: string | undefined;
  readonly count: number;
  readonly error: string | undefined;
}

export interface FailedTransactionListResponse {
  readonly items: readonly FailedTransactionRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly queues: readonly DeadLetterQueueCount[];
}

/** One processing run of the business message (one MPL). */
export interface RetryAttempt {
  readonly mplId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: Severity;
  readonly startTime: string;
  readonly endTime: string | undefined;
}

/**
 * How often this business message has been processed and retried, derived from SAP's own records:
 * every processing run sharing the correlation id, plus the broker's redelivery count.
 */
export interface RetryHistory {
  readonly correlationId: string | undefined;
  /** Processing runs found for the correlation id (the original attempt included). */
  readonly attempts: number;
  /** `attempts - 1`: how many times it was processed again after the first run. */
  readonly retries: number;
  /** Runs that ended in an error status (each one landed it back on a dead-letter queue). */
  readonly failedAttempts: number;
  readonly jmsRetryCount: number;
  readonly runs: readonly RetryAttempt[];
  /** True when the run list hit the read limit, so counts are a lower bound. */
  readonly truncated: boolean;
}

export interface FailedTransactionDetail {
  readonly message: FailedTransactionRow;
  readonly recoveryPath: readonly RecoveryPathStep[];
  readonly history: RetryHistory;
  readonly interchange: InterchangeSummary | undefined;
}

export interface FailedTransactionRetryResult {
  readonly messageId: string;
  readonly queueName: string;
  readonly outcome: MessageRecoveryOutcome;
}

export interface FailedTransactionBulkRetryResult {
  readonly results: readonly FailedTransactionRetryResult[];
}
