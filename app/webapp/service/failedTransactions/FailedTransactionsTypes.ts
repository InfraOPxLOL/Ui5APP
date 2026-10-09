/** Client-side mirrors of the Failed Transactions API (`/api/v1/failed-transactions`). */

import type { Interchange } from "../reportServer/ReportServerTypes";

export type DeadLetterKind = "processing" | "receiver" | "other";

export interface FailedInterchangeRef {
  readonly id: string;
  readonly overallStatus: string;
  readonly senderPartner?: string;
  readonly receiverPartner?: string;
  readonly documentStandard?: string;
  readonly messageType?: string;
  readonly controlNumber?: string;
}

export interface FailedTransaction {
  readonly messageId: string;
  readonly queueName: string;
  readonly deadLetterKind: DeadLetterKind;
  readonly targetQueue?: string;
  readonly failedAt: string;
  readonly jmsRetryCount: number;
  readonly mplId?: string;
  readonly correlationId?: string;
  readonly sender?: string;
  readonly receiver?: string;
  readonly messageType?: string;
  readonly applicationId?: string;
  readonly expiresAt?: string;
  readonly interchange?: FailedInterchangeRef;
}

export interface DeadLetterQueueCount {
  readonly queueName: string;
  readonly deadLetterKind: DeadLetterKind;
  readonly targetQueue?: string;
  readonly count: number;
  readonly error?: string;
}

export interface FailedTransactionListResponse {
  readonly items: readonly FailedTransaction[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly queues: readonly DeadLetterQueueCount[];
}

export interface RecoveryPathStep {
  readonly action: "LOCATED" | "MOVE" | "VERIFY" | "RETRY" | "MANUAL";
  readonly queueName?: string;
  readonly description: string;
}

export interface RetryAttempt {
  readonly mplId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: "success" | "warning" | "error" | "information" | string;
  readonly startTime: string;
  readonly endTime?: string;
}

export interface RetryHistory {
  readonly correlationId?: string;
  readonly attempts: number;
  readonly retries: number;
  readonly failedAttempts: number;
  readonly jmsRetryCount: number;
  readonly runs: readonly RetryAttempt[];
  readonly truncated: boolean;
}

export interface FailedTransactionDetail {
  readonly message: FailedTransaction;
  readonly recoveryPath: readonly RecoveryPathStep[];
  readonly history: RetryHistory;
  readonly interchange?: Interchange;
}

export type RecoveryOutcomeStatus =
  | "accepted"
  | "successful"
  | "already-processed"
  | "failed"
  | "unavailable";

export interface RecoveryStepResult {
  readonly action: RecoveryPathStep["action"];
  readonly queueName?: string;
  readonly succeeded: boolean;
  readonly detail: string;
}

export interface RecoveryOutcome {
  readonly messageId: string;
  readonly status: RecoveryOutcomeStatus;
  readonly steps: readonly RecoveryStepResult[];
  readonly note: string;
}

export interface FailedTransactionRetryResult {
  readonly messageId: string;
  readonly queueName: string;
  readonly outcome: RecoveryOutcome;
}

export interface FailedTransactionQuery {
  readonly queue?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** The body of a parked message, read straight from the broker. */
export interface FailedTransactionPayload {
  readonly messageId: string;
  readonly queueName: string;
  /** UTF-8 text, or base64 when `encoding` is `base64`. */
  readonly content: string;
  readonly encoding: "text" | "base64";
  readonly format: "edi" | "xml" | "json" | "text" | "binary";
  readonly sizeBytes: number;
}
