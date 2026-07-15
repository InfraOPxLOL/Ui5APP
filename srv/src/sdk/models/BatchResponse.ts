import type { BaseResponse } from "./BaseResponse.js";

/** The outcome of one operation within a batch request. */
export type BatchOperationResult<T> =
  | { readonly success: true; readonly status: number; readonly data: T }
  | { readonly success: false; readonly status: number; readonly error: string };

/**
 * The response envelope for a batched OData/REST request (`sdk/odata` `ODataBatchBuilder`):
 * one result per submitted operation, in submission order, each independently succeeded or failed
 * — a batch never partially throws, callers inspect each {@link BatchOperationResult}.
 */
export interface BatchResponse<T = unknown> extends BaseResponse {
  readonly results: ReadonlyArray<BatchOperationResult<T>>;
}

/**
 * @param response a batch response.
 * @returns the number of operations that failed.
 */
export function countBatchFailures(response: BatchResponse): number {
  return response.results.filter((result) => !result.success).length;
}
