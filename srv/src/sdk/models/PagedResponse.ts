import type { BaseResponse } from "./BaseResponse.js";

/**
 * A page of results from any SDK list operation (REST or OData). `skip`/`top` echo the effective
 * paging applied (after server-side clamping), so callers can compute whether more pages remain
 * without re-deriving the request.
 */
export interface PagedResponse<T> extends BaseResponse {
  readonly items: readonly T[];
  readonly total: number;
  readonly skip: number;
  readonly top: number;
}

/**
 * @param response a paged response.
 * @returns whether another page exists beyond this one.
 */
export function hasNextPage<T>(response: PagedResponse<T>): boolean {
  return response.skip + response.items.length < response.total;
}
