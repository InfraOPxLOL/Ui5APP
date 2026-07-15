import type { ICertificateProvider } from "../../core/providers/ICertificateProvider.js";
import type { CertificateInfo } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Security materials sub-client (architecture: Integration Suite Client, §4 —
 * `SecurityMaterialClient`).
 *
 * SAP Integration Suite's "Security Material" concept spans keystore entries (certificates, key
 * pairs), user credentials and OAuth2 client credentials. Phase 3's provider framework covers only
 * the certificate/keystore subset ({@link ICertificateProvider}) — no dedicated contract exists yet
 * for the broader set, and Phase 4 introduces no additional DTO for it. This client therefore
 * surfaces the certificate subset today under the security-materials-shaped API name; broadening it
 * to user credentials / OAuth2 client credentials is a documented future extension once those gain
 * their own provider contract and DTOs.
 */
export class SecurityMaterialClient {
  public constructor(
    private readonly certificateProvider: ICertificateProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Lists the certificate/keystore subset of security materials. */
  public listMaterials(context?: ClientCallContext): Promise<readonly CertificateInfo[]> {
    return this.certificateProvider.listCertificates(resolveContext(this.defaultTenantId, context));
  }
}
