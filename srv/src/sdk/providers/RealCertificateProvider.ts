import type { ICertificateProvider } from "../../core/providers/ICertificateProvider.js";
import type { CertificateInfo, ProviderContext } from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { parseODataV2DateTime } from "./RealProviderSupport.js";

/**
 * Raw shape of one `KeystoreEntries` entity, per SAP Integration Suite's documented Security Content
 * OData v1 API.
 */
interface CpiKeystoreEntry {
  readonly Alias: string;
  readonly Type: string;
  readonly Owner?: string;
  readonly Issuer?: string;
  readonly ValidFrom?: string;
  readonly ValidTo?: string;
  readonly SerialNumber?: string;
}

/**
 * Live implementation of {@link ICertificateProvider}, backed by SAP Integration Suite's
 * `KeystoreEntries` OData entity set (architecture: Certificate Provider, §9). Read-only, matching
 * the Phase-3 contract; the expiry sweep filters/sorts over the same fetched list the mock
 * implementation does, just populated from a real tenant.
 */
export class RealCertificateProvider implements ICertificateProvider {
  private readonly odataClient: ODataClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
  }

  /** @inheritdoc */
  public async listCertificates(context: ProviderContext): Promise<readonly CertificateInfo[]> {
    return this.pipeline.run({
      operationName: "certificate.listCertificates",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiKeystoreEntry>(
          `${tenant.baseUrl}/KeystoreEntries`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return items.map(RealCertificateProvider.toDomain);
      },
    });
  }

  /** @inheritdoc */
  public async listExpiring(
    context: ProviderContext,
    withinDays: number,
  ): Promise<readonly CertificateInfo[]> {
    return this.pipeline.run({
      operationName: "certificate.listExpiring",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiKeystoreEntry>(
          `${tenant.baseUrl}/KeystoreEntries`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        const horizon = Date.now() + withinDays * 86400000;
        return items
          .map(RealCertificateProvider.toDomain)
          .filter((certificate) => new Date(certificate.validTo).getTime() <= horizon)
          .sort((a, b) => new Date(a.validTo).getTime() - new Date(b.validTo).getTime());
      },
    });
  }

  private static toDomain(raw: CpiKeystoreEntry): CertificateInfo {
    return {
      alias: raw.Alias,
      keyType: raw.Type,
      owner: raw.Owner,
      issuer: raw.Issuer,
      validFrom: parseODataV2DateTime(raw.ValidFrom) ?? "",
      validTo: parseODataV2DateTime(raw.ValidTo) ?? "",
      serialNumber: raw.SerialNumber,
    };
  }
}
