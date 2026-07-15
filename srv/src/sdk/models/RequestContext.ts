/**
 * Per-call context threaded through every SDK request: which tenant to talk to, how to trace it,
 * and who is asking. Every SDK entry point (providers, sub-clients) takes one of these as its
 * first argument — the SDK never infers tenant or correlation state from ambient/global state, so
 * it stays safe to call concurrently for different tenants and remains usable outside a web
 * request lifecycle (jobs, tests, other host applications).
 */
export interface RequestContext {
  /** Tenant to target, resolved via the Destination framework (see `sdk/destination`). */
  readonly tenantId: string;
  /** Correlation id propagated as a header and into every log line for this call. */
  readonly correlationId: string;
  /** Identity of the caller, for audit/logging (e.g. the authenticated user id); optional. */
  readonly actor?: string;
  /** Abort signal allowing the caller to cancel the in-flight request. */
  readonly signal?: AbortSignal;
}

/**
 * Builds a {@link RequestContext}, generating a correlation id when the caller doesn't already
 * have one to propagate (e.g. from an inbound HTTP request).
 * @param tenantId the target tenant id.
 * @param options optional correlation id, actor and abort signal.
 * @returns a complete request context.
 */
export function createRequestContext(
  tenantId: string,
  options: { correlationId?: string; actor?: string; signal?: AbortSignal } = {},
): RequestContext {
  return {
    tenantId,
    correlationId: options.correlationId ?? crypto.randomUUID(),
    actor: options.actor,
    signal: options.signal,
  };
}
