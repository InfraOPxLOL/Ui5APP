import type { ProviderContext } from "../../core/providers/types.js";

/** Optional per-call overrides accepted by every sub-client method. */
export interface ClientCallContext {
  readonly tenantId?: string;
  readonly correlationId?: string;
}

/**
 * Resolves a full {@link ProviderContext} from an optional per-call override and a client's
 * configured default tenant — every sub-client method accepts an optional context so a caller can
 * target a non-default tenant or propagate an existing correlation id, without requiring either.
 * @param defaultTenantId the sub-client's configured default tenant.
 * @param context optional per-call override.
 * @returns the resolved provider context.
 */
export function resolveContext(
  defaultTenantId: string,
  context?: ClientCallContext,
): ProviderContext {
  return {
    tenantId: context?.tenantId ?? defaultTenantId,
    correlationId: context?.correlationId ?? crypto.randomUUID(),
  };
}
