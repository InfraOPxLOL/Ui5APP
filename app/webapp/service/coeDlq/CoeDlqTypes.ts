/**
 * Client-side mirror of the DLQ & Intelligent Recovery Dashboard backend DTOs (`/api/v1/coe-dlq`).
 * The only shapes the workspace consumes — no SDK/OData/CPI shape ever reaches the UI.
 */

/** One failed-message row (master list). */
export interface DlqMessage {
  readonly messageId: string;
  readonly correlationId: string;
  readonly interfaceTarget: string;
  readonly sender: string;
  readonly receiver: string;
  readonly messageType: string | undefined;
  readonly documentId: string | undefined;
  readonly status: string;
  readonly severity: string;
  readonly startTime: string;
}

/** A page of failed messages. */
export interface DlqMessageList {
  readonly items: readonly DlqMessage[];
  readonly total: number;
}

/** One error-detail line. */
export interface DlqErrorDetail {
  readonly text: string;
  readonly category: string | undefined;
}

/** The recovery context for one failed message (queue resolution + error details). */
export interface DlqRecovery {
  readonly messageId: string;
  readonly sender: string;
  readonly receiver: string;
  readonly messageType: string | undefined;
  readonly agreementPid: string;
  readonly resolvedQueue: string | undefined;
  readonly resolutionSource: "partner-directory" | "unavailable";
  readonly errorDetails: readonly DlqErrorDetail[];
}

/** The outcome of a replay attempt. */
export interface DlqReplayResult {
  readonly messageId: string;
  readonly resolvedQueue: string | undefined;
  readonly executed: boolean;
  readonly note: string;
}
