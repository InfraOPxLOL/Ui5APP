/**
 * Data transfer objects for the Message Replay module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Message Replay row. */
export interface MessageReplayDto {
  readonly messageId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly failedAt: string;
  readonly retryCount: number;
}

/** Result of the replay action. */
export interface ReplayResultDto {
  readonly messageId: string;
  readonly accepted: boolean;
  readonly correlationId: string;
}
