import type { ICertificateProvider } from "../../core/providers/ICertificateProvider.js";
import type { CertificateInfo, ProviderContext } from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateCertificates } from "../mock/fixtures/index.js";

/** Mock implementation of {@link ICertificateProvider} (architecture: Provider Framework, §10). */
export class MockCertificateProvider implements ICertificateProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async listCertificates(context: ProviderContext): Promise<readonly CertificateInfo[]> {
    return this.mockEngine.resolve({
      operationKey: "certificate.listCertificates",
      tenantId: context.tenantId,
      generateSuccess: () => generateCertificates(20),
      generateEmpty: () => [],
      generateLarge: () => generateCertificates(250),
    });
  }

  /** @inheritdoc */
  public async listExpiring(
    context: ProviderContext,
    withinDays: number,
  ): Promise<readonly CertificateInfo[]> {
    const all = await this.mockEngine.resolve({
      operationKey: "certificate.listExpiring",
      tenantId: context.tenantId,
      generateSuccess: () => generateCertificates(20),
      generateEmpty: () => [],
    });
    const horizon = Date.now() + withinDays * 86400000;
    return all
      .filter((certificate) => new Date(certificate.validTo).getTime() <= horizon)
      .sort((a, b) => new Date(a.validTo).getTime() - new Date(b.validTo).getTime());
  }
}
