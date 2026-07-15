/**
 * Resolved connectivity context for one tenant: everything the HTTP layer needs to reach it,
 * produced by the Destination framework (`sdk/destination`) and consumed by the request pipeline.
 * This is intentionally distinct from the platform's `tenants.json` config entry — that is
 * *configuration*; this is the *resolved, ready-to-call* result (base URL plus live auth headers)
 * for one request.
 */
export interface TenantContext {
  /** Tenant id this context was resolved for. */
  readonly tenantId: string;
  /** Resolved API base URL for the tenant. */
  readonly baseUrl: string;
  /** Headers to merge into every outbound request for this tenant (includes auth). */
  readonly headers: Readonly<Record<string, string>>;
  /** BTP Destination name the connectivity was resolved from, for diagnostics/logging. */
  readonly destinationName: string;
}
