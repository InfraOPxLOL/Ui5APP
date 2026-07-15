import type { ICertificateProvider } from "../../core/providers/ICertificateProvider.js";
import type { CertificateInfo } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Certificate sub-client (architecture: Integration Suite Client, §4 — `CertificateClient`). Thin
 * facade over {@link ICertificateProvider} for the Certificate Management module and its expiry
 * sweep.
 */
export class CertificateClient {
  public constructor(
    private readonly provider: ICertificateProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Lists all keystore entries. See {@link ICertificateProvider.listCertificates}. */
  public listCertificates(context?: ClientCallContext): Promise<readonly CertificateInfo[]> {
    return this.provider.listCertificates(resolveContext(this.defaultTenantId, context));
  }

  /** Lists entries expiring within a horizon. See {@link ICertificateProvider.listExpiring}. */
  public listExpiring(
    withinDays: number,
    context?: ClientCallContext,
  ): Promise<readonly CertificateInfo[]> {
    return this.provider.listExpiring(resolveContext(this.defaultTenantId, context), withinDays);
  }
}
