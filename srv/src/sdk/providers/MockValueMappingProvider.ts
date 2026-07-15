import type { IValueMappingProvider } from "../../core/providers/IValueMappingProvider.js";
import type { ProviderContext, ValueMappingScheme } from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateValueMappingSchemes } from "../mock/fixtures/index.js";

/** Mock implementation of {@link IValueMappingProvider} (architecture: Provider Framework, §10). */
export class MockValueMappingProvider implements IValueMappingProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async listSchemes(context: ProviderContext): Promise<readonly ValueMappingScheme[]> {
    return this.mockEngine.resolve({
      operationKey: "valueMapping.listSchemes",
      tenantId: context.tenantId,
      generateSuccess: () => generateValueMappingSchemes(4),
      generateEmpty: () => [],
    });
  }

  /** @inheritdoc */
  public async getScheme(
    context: ProviderContext,
    schemeName: string,
  ): Promise<ValueMappingScheme | undefined> {
    const all = await this.mockEngine.resolve({
      operationKey: "valueMapping.getScheme",
      tenantId: context.tenantId,
      generateSuccess: () => generateValueMappingSchemes(4),
    });
    return all.find((scheme) => scheme.name === schemeName);
  }
}
