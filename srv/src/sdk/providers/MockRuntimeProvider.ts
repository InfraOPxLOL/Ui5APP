import type { IRuntimeProvider } from "../../core/providers/IRuntimeProvider.js";
import type { ProviderContext, RuntimeArtifactStatus } from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateRuntimeArtifacts } from "../mock/fixtures/index.js";

/** Mock implementation of {@link IRuntimeProvider} (architecture: Provider Framework, §10). */
export class MockRuntimeProvider implements IRuntimeProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async listArtifacts(context: ProviderContext): Promise<readonly RuntimeArtifactStatus[]> {
    return this.mockEngine.resolve({
      operationKey: "runtime.listArtifacts",
      tenantId: context.tenantId,
      generateSuccess: () => generateRuntimeArtifacts(6),
      generateEmpty: () => [],
      generateLarge: () => generateRuntimeArtifacts(250),
    });
  }

  /** @inheritdoc */
  public async getArtifact(
    context: ProviderContext,
    artifactId: string,
  ): Promise<RuntimeArtifactStatus | undefined> {
    const all = await this.mockEngine.resolve({
      operationKey: "runtime.getArtifact",
      tenantId: context.tenantId,
      generateSuccess: () => generateRuntimeArtifacts(6),
    });
    return all.find((artifact) => artifact.artifactId === artifactId) ?? all[0];
  }

  /** @inheritdoc */
  public async restartArtifact(context: ProviderContext, artifactId: string): Promise<void> {
    await this.mockEngine.resolve({
      operationKey: "runtime.restartArtifact",
      tenantId: context.tenantId,
      generateSuccess: () => ({ artifactId }),
    });
  }
}
