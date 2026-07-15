import type { IRuntimeProvider } from "../../core/providers/IRuntimeProvider.js";
import type { RuntimeArtifactStatus } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Runtime-artifact sub-client (architecture: Integration Suite Client, §4 — `RuntimeClient`). Thin
 * facade over {@link IRuntimeProvider} for Live Monitoring's artifact health view and the
 * Dashboard's runtime KPIs.
 */
export class RuntimeClient {
  public constructor(
    private readonly provider: IRuntimeProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Lists deployed runtime artifacts. See {@link IRuntimeProvider.listArtifacts}. */
  public listArtifacts(context?: ClientCallContext): Promise<readonly RuntimeArtifactStatus[]> {
    return this.provider.listArtifacts(resolveContext(this.defaultTenantId, context));
  }

  /** Reads one artifact's runtime status. See {@link IRuntimeProvider.getArtifact}. */
  public getArtifact(
    artifactId: string,
    context?: ClientCallContext,
  ): Promise<RuntimeArtifactStatus | undefined> {
    return this.provider.getArtifact(resolveContext(this.defaultTenantId, context), artifactId);
  }

  /** Requests a restart of a deployed artifact. See {@link IRuntimeProvider.restartArtifact}. */
  public restartArtifact(artifactId: string, context?: ClientCallContext): Promise<void> {
    return this.provider.restartArtifact(resolveContext(this.defaultTenantId, context), artifactId);
  }
}
