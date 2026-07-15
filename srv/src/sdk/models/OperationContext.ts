import type { RequestContext } from "./RequestContext.js";
import type { TenantContext } from "./TenantContext.js";

/**
 * The fully-assembled context for a single SDK operation, produced by the request pipeline before
 * it invokes the transport: the caller's {@link RequestContext} merged with the resolved
 * {@link TenantContext}, plus bookkeeping the pipeline stages read and write as the request
 * travels through them (architecture: Request Pipeline, §7).
 *
 * This is a pipeline-internal type — providers and sub-clients never construct one directly; the
 * {@link RequestPipeline} builds it from a `RequestContext` and passes it through each middleware.
 */
export interface OperationContext {
  /** The caller-supplied request context (tenant id, correlation id, actor, abort signal). */
  readonly request: RequestContext;
  /** The resolved tenant connectivity (base URL, auth headers), set by destination-resolution middleware. */
  tenant?: TenantContext;
  /** Unique id for this specific HTTP attempt (differs from correlation id across retries). */
  requestId?: string;
  /** Logical operation name for logging/metrics (e.g. `monitoring.queryMessageLogs`). */
  readonly operationName: string;
  /** Wall-clock start time (epoch ms), set when the pipeline begins executing. */
  startedAt?: number;
  /** Number of attempts made so far (1 = first attempt, incremented on each retry). */
  attempt: number;
  /** Free-form bag middlewares use to pass data forward (e.g. cache keys); not part of the public contract. */
  readonly bag: Record<string, unknown>;
}

/**
 * Creates a fresh {@link OperationContext} for the start of a pipeline execution.
 * @param request the caller-supplied request context.
 * @param operationName logical operation name for logging/metrics.
 * @returns a new, unstarted operation context.
 */
export function createOperationContext(
  request: RequestContext,
  operationName: string,
): OperationContext {
  return { request, operationName, attempt: 1, bag: {} };
}
