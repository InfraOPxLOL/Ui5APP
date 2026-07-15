/**
 * DTOs for the DLQ & Intelligent Recovery Dashboard (spec §6, Tile 4). The master list is failed
 * messages read from the MPL monitoring API; the detail/recovery view resolves the target JMS queue
 * for a message via the Partner Directory (the read side of spec §6C's "intelligent retry queue
 * resolution algorithm"). Composed entirely from the Operations Engine.
 */

/** One failed-message row (master list) — surfaced with the CoE-relevant business identifiers. */
export interface DlqMessageDto {
  readonly messageId: string;
  readonly correlationId: string;
  /** Interface Target (spec §6A — from the integration flow / X-Iflow-ID). */
  readonly interfaceTarget: string;
  readonly sender: string;
  readonly receiver: string;
  readonly messageType: string | undefined;
  /** Business Document ID (spec §6A — X-DOCNUM; the application id is the closest available field today). */
  readonly documentId: string | undefined;
  readonly status: string;
  readonly severity: string;
  readonly startTime: string;
}

/** A page of failed messages. */
export interface DlqMessageListDto {
  readonly items: readonly DlqMessageDto[];
  readonly total: number;
}

/** One error-detail line for the diagnostic pane. */
export interface DlqErrorDetailDto {
  readonly text: string;
  readonly category: string | undefined;
}

/**
 * The recovery context for one failed message (spec §6B/§6C). `resolvedQueue` is the JMS queue the
 * message would be replayed to, resolved from the Partner Directory agreement for its sender/receiver
 * pair; `undefined` (with `resolutionSource: "unavailable"`) when no routing agreement exists.
 *
 * `CH-Message-Log-*` diagnostic properties (spec §6B) are not exposed by the current SDK's MPL
 * provider (a documented seam — the domain model carries no per-message property bag today), so the
 * pane shows the available error details rather than fabricated content.
 */
export interface DlqRecoveryDto {
  readonly messageId: string;
  readonly sender: string;
  readonly receiver: string;
  readonly messageType: string | undefined;
  readonly agreementPid: string;
  readonly resolvedQueue: string | undefined;
  readonly resolutionSource: "partner-directory" | "unavailable";
  readonly errorDetails: readonly DlqErrorDetailDto[];
}

/**
 * The outcome of a replay attempt (spec §6C). Automatic re-injection through the CoE platform's
 * replay endpoint (the `X-JMSQ1` header path) is not exposed by the current SDK, so `executed` is
 * `false` and the result reports the resolved target queue for a manual/operator replay — never a
 * fabricated success.
 */
export interface DlqReplayResultDto {
  readonly messageId: string;
  readonly resolvedQueue: string | undefined;
  readonly executed: boolean;
  readonly note: string;
}
