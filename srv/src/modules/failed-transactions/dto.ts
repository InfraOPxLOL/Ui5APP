import type {
  InterchangeSummary,
  MessageRecoveryOutcome,
  RecoveryPathStep,
  TransactionDetail,
} from "../../operations/dto/index.js";
import type { Severity } from "../../operations/transform/index.js";

/** Which screen a dead-letter queue belongs to: TPM (B2B) or the in-house frameworks (non-B2B). */
export type FailedTransactionCategory = "b2b" | "nonB2b";

/**
 * What kind of dead-letter queue a message sits on, in business words: the two TPM ones
 * (`processing`, `receiver`), the JMS framework's central DLQ (`jms`) or the router's (`router`).
 */
export type DeadLetterKind = "processing" | "receiver" | "jms" | "router" | "other";

/**
 * Where a retry's destination came from: the queue's configured mapping (`configured`), the JMS
 * ingress dispatcher's queue header (`header`), or the queue consumer flow that picked the message
 * up (`consumerFlow`). `undefined` = not determined; the operator chooses.
 */
export type TargetSource = "configured" | "header" | "consumerFlow";

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

/** One message sitting on a dead-letter queue. */
export interface FailedTransactionRow {
  /** JMS message id — the key retries act on. */
  readonly messageId: string;
  readonly queueName: string;
  readonly category: FailedTransactionCategory;
  /** The framework the dead-letter queue belongs to (`TPM_V2`, `JMS_FRAMEWORK`, `COMMON_IDOC_ROUTER`). */
  readonly framework: string;
  readonly deadLetterKind: DeadLetterKind;
  /** The queue a retry moves the message back to; `undefined` when it is not yet determined. */
  readonly targetQueue: string | undefined;
  readonly targetSource: TargetSource | undefined;
  /** Non-B2B: the business flow the transaction is for, once it has run. */
  readonly businessFlow: string | undefined;
  /** Non-B2B: the transaction's path in words (router, JMS queue, business flow). */
  readonly path: readonly string[];
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
  readonly category: FailedTransactionCategory;
  readonly framework: string;
  readonly deadLetterKind: DeadLetterKind;
  readonly targetQueue: string | undefined;
  readonly count: number;
  readonly error: string | undefined;
}

export interface FailedTransactionListResponse {
  readonly category: FailedTransactionCategory;
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
  /** B2B: the linked interchange. */
  readonly interchange: InterchangeSummary | undefined;
  /** Non-B2B: every step of the transaction (router, JMS framework, business flow). */
  readonly transaction: TransactionDetail | undefined;
  /**
   * The queues the operator may choose from when the destination could not be determined (the JMS
   * framework's processing queues). Empty when no choice is needed.
   */
  readonly queueOptions: readonly string[];
}

export interface FailedTransactionRetryResult {
  readonly messageId: string;
  readonly queueName: string;
  readonly outcome: MessageRecoveryOutcome;
}

export interface FailedTransactionBulkRetryResult {
  readonly results: readonly FailedTransactionRetryResult[];
}

/** How a message body should be rendered. */
export type FailedTransactionPayloadFormat = "edi" | "xml" | "json" | "text" | "binary";

/** The body of a parked message, read straight from the broker. */
export interface FailedTransactionPayload {
  readonly messageId: string;
  readonly queueName: string;
  /** UTF-8 text, or base64 when `encoding` is `base64`. */
  readonly content: string;
  readonly encoding: "text" | "base64";
  readonly format: FailedTransactionPayloadFormat;
  readonly sizeBytes: number;
}
