import type { RuntimeClient } from "../../sdk/client/RuntimeClient.js";
import type { RuntimeArtifactStatus } from "../../core/providers/types.js";
import type { RuntimeSummary } from "../dto/RuntimeDto.js";
import type { ValueCount } from "../dto/StatisticsDto.js";
import { OperationsCache } from "../cache/index.js";
import { countByValue, humanReadableStatus, runtimeHealth } from "../transform/index.js";

/**
 * Aggregates deployed runtime artifact information (architecture: Phase 6, Runtime Engine, §6). The
 * only place any future module reads runtime artifact state from — always through
 * {@link RuntimeSummary}, never through `sdk.runtime`'s `RuntimeArtifactStatus` directly.
 */
export class RuntimeEngine {
  public constructor(
    private readonly client: RuntimeClient,
    private readonly cache: OperationsCache,
  ) {}

  /** Lists every deployed runtime artifact, enriched with health/human-readable status. */
  public async listArtifacts(): Promise<readonly RuntimeSummary[]> {
    return this.cache.dedupe("runtime.list", async () => {
      const artifacts = await this.client.listArtifacts();
      return artifacts.map(RuntimeEngine.toSummary);
    });
  }

  /**
   * Reads one artifact's runtime status.
   * @param artifactId the runtime artifact id.
   * @returns the artifact summary, or `undefined` when not deployed.
   */
  public async getArtifact(artifactId: string): Promise<RuntimeSummary | undefined> {
    return this.cache.dedupe(`runtime.get:${artifactId}`, async () => {
      const artifact = await this.client.getArtifact(artifactId);
      return artifact === undefined ? undefined : RuntimeEngine.toSummary(artifact);
    });
  }

  /**
   * Requests a restart (redeploy) of a deployed artifact — a future runtime operation this engine
   * already exposes a stable seam for (architecture: Phase 6 — "Support future runtime operations").
   * @param artifactId the runtime artifact id.
   */
  public async restartArtifact(artifactId: string): Promise<void> {
    return this.client.restartArtifact(artifactId);
  }

  /** @returns the distribution of artifacts across their raw status values. */
  public async getStatusDistribution(): Promise<readonly ValueCount[]> {
    const artifacts = await this.listArtifacts();
    return countByValue(artifacts, (artifact) => artifact.status);
  }

  private static toSummary(artifact: RuntimeArtifactStatus): RuntimeSummary {
    return {
      artifactId: artifact.artifactId,
      name: artifact.name,
      type: artifact.type,
      version: artifact.version,
      status: artifact.status,
      humanReadableStatus: humanReadableStatus(artifact.status),
      health: runtimeHealth(artifact.status),
      deployedOn: artifact.deployedOn,
      deployedBy: artifact.deployedBy,
      errorText: artifact.errorText,
    };
  }
}
