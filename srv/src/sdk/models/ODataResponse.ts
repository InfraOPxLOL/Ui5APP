import type { BaseResponse } from "./BaseResponse.js";

/**
 * The raw shape of a parsed OData v2 (`d.results`/`d.__count`) or v4 (`value`/`@odata.count`)
 * response, before the OData framework normalizes it into a {@link PagedResponse}. Exposed for
 * callers that need OData-specific metadata (continuation tokens, `__next` links) the normalized
 * shape drops.
 */
export interface ODataResponse<T> extends BaseResponse {
  readonly value: readonly T[];
  /** Total count, present when `$count`/`$inlinecount` was requested. */
  readonly count?: number;
  /** Server-driven paging continuation token/URL (OData `@odata.nextLink` / `__next`), if any. */
  readonly nextLink?: string;
}
