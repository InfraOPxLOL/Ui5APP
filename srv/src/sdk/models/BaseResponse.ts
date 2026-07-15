/**
 * Base shape every SDK response envelope extends: diagnostic metadata that has nothing to do with
 * the payload itself, attached uniformly by the request pipeline after each call completes.
 */
export interface BaseResponse {
  /** Correlation id the response was returned for (echoes `RequestContext.correlationId`). */
  readonly correlationId: string;
  /** Wall-clock duration of the call, in milliseconds. */
  readonly durationMs: number;
  /** Whether this response was served by the mock engine rather than a live call. */
  readonly mocked: boolean;
}
