/**
 * Barrel for the SDK's cross-cutting models — the vocabulary every SDK layer (HTTP, OData, REST,
 * providers, sub-clients) shares. Import from here rather than individual files.
 */
export type { BaseRequest } from "./BaseRequest.js";
export type { BaseResponse } from "./BaseResponse.js";
export { hasNextPage, type PagedResponse } from "./PagedResponse.js";
export type { ErrorResponse } from "./ErrorResponse.js";
export type { ApiResponse } from "./ApiResponse.js";
export type { ODataResponse } from "./ODataResponse.js";
export {
  countBatchFailures,
  type BatchOperationResult,
  type BatchResponse,
} from "./BatchResponse.js";
export type { TenantContext } from "./TenantContext.js";
export { createRequestContext, type RequestContext } from "./RequestContext.js";
export { createOperationContext, type OperationContext } from "./OperationContext.js";
