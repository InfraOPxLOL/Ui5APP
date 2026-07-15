import type { ProviderContext, RuntimeArtifactStatus } from "./types.js";

/**
 * Access to deployed integration artifact runtime state on an Integration Suite tenant.
 *
 * Backing Live Monitoring's artifact health view and the Dashboard's runtime KPIs: which
 * integration flows are deployed, started, errored — and the ability to restart one.
 */
export interface IRuntimeProvider {
  /**
   * Lists all deployed runtime artifacts and their statuses.
   * @param context the tenant/correlation context.
   * @returns the deployed artifacts.
   */
  listArtifacts(context: ProviderContext): Promise<readonly RuntimeArtifactStatus[]>;

  /**
   * Reads a single artifact's runtime status.
   * @param context the tenant/correlation context.
   * @param artifactId the runtime artifact id.
   * @returns the artifact status, or `undefined` when not deployed.
   */
  getArtifact(
    context: ProviderContext,
    artifactId: string,
  ): Promise<RuntimeArtifactStatus | undefined>;

  /**
   * Requests a restart of a deployed artifact.
   * @param context the tenant/correlation context.
   * @param artifactId the runtime artifact id.
   */
  restartArtifact(context: ProviderContext, artifactId: string): Promise<void>;
}
