import type { DestinationResolveOptions, DeploymentEnvironment } from "./DestinationTypes.js";
import type { TenantContext } from "../models/TenantContext.js";

/**
 * Resolves a tenant id into a ready-to-call {@link TenantContext} (base URL + live auth headers).
 * The single seam the request pipeline's destination-resolution middleware depends on — no SDK
 * code ever hardcodes a tenant URL (architecture: Destination Framework, §3).
 */
export interface IDestinationResolver {
  /**
   * Resolves connectivity for one tenant.
   * @param options tenant id (or default) plus a correlation id for tracing.
   * @returns the resolved tenant context.
   * @throws {ConfigurationError} when no matching, resolvable destination exists.
   */
  resolve(options: DestinationResolveOptions): Promise<TenantContext>;

  /**
   * @returns the distinct deployment environments represented across all known destinations.
   */
  listEnvironments(): Promise<readonly DeploymentEnvironment[]>;
}
