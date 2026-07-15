import type { AuthProviderConfig } from "../auth/AuthTypes.js";

/**
 * The deployment stages the Destination framework distinguishes (architecture: Destination
 * Framework, §3). Distinct from the platform's `environment.json` `kind` (Phase 3) — this is the
 * SDK's own, app-independent vocabulary, so the SDK stays usable outside this application.
 */
export type DeploymentEnvironment = "development" | "testing" | "production";

/**
 * A single resolvable destination: everything the {@link DestinationResolver} needs to produce a
 * ready-to-call {@link TenantContext} for one tenant, in one environment. Multiple tenants and
 * multiple destinations are both supported simply by supplying multiple definitions — there is
 * nothing tenant-count-specific in the resolver itself.
 */
export interface DestinationDefinition {
  /** Tenant id this destination serves. */
  readonly tenantId: string;
  /** Underlying named destination (e.g. a BTP Destination service entry), for diagnostics. */
  readonly destinationName: string;
  /** Resolved API base URL. */
  readonly baseUrl: string;
  /** Which deployment stage this destination belongs to. */
  readonly environment: DeploymentEnvironment;
  /** How to authenticate calls made through this destination. */
  readonly authConfig: AuthProviderConfig;
  /** The destination used when a call specifies no tenant id. */
  readonly default?: boolean;
}

/** Input to {@link IDestinationResolver.resolve}. */
export interface DestinationResolveOptions {
  /** Tenant to resolve; the default destination is used when omitted. */
  readonly tenantId?: string;
  /** Correlation id, propagated into the auth provider call for tracing. */
  readonly correlationId: string;
}

/**
 * The static, non-secret binding between a platform tenant and the named destination that resolves
 * its connectivity — the input a discovery provider turns into a {@link DestinationDefinition}
 * (architecture: Destination Framework, §3 — "Multi Tenant"). Distinct from
 * {@link DestinationDefinition} itself: a binding carries no credentials at all, only the pointer to
 * where they live (`destinationName`) plus enough context (fallback URL, environment) to resolve
 * without them when discovery is static.
 */
export interface TenantDestinationBinding {
  /** Tenant id this binding serves. */
  readonly tenantId: string;
  /** Named destination (BTP Destination service entry, or a local static entry) to resolve. */
  readonly destinationName: string;
  /** Which deployment stage this tenant belongs to. */
  readonly environment: DeploymentEnvironment;
  /**
   * Base URL used only when a discovery provider cannot supply one of its own (e.g. a static
   * fallback, or a BTP Destination entry that omits `URL`). A live Destination-service lookup's own
   * `URL` always takes precedence over this value.
   */
  readonly fallbackBaseUrl: string;
  /** The destination used when a call specifies no tenant id. */
  readonly default?: boolean;
}
