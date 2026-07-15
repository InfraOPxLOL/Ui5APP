import type { BaseResponse } from "./BaseResponse.js";

/**
 * The generic single-entity response envelope returned by SDK operations that fetch or mutate one
 * resource (as opposed to a list — see {@link PagedResponse}).
 */
export interface ApiResponse<T> extends BaseResponse {
  readonly data: T;
}
