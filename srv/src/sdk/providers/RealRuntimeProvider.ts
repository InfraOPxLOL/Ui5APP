import type { IRuntimeProvider } from "../../core/providers/IRuntimeProvider.js";
import type { ProviderContext, RuntimeArtifactStatus } from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import type { TenantContext } from "../models/TenantContext.js";
import type { OperationContext } from "../models/OperationContext.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { parseODataV2DateTime, toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Raw shape of one `IntegrationRuntimeArtifacts` entity, per SAP Integration Suite's OData v1 Monitoring API. */
interface CpiIntegrationRuntimeArtifact {
  readonly Id: string;
  readonly Name: string;
  readonly Type: string;
  readonly Version: string;
  readonly DeployedBy?: string;
  readonly DeployedOn?: string;
  readonly Status: string;
  readonly ErrorInformation?: string;
}

/**
 * Live implementation of {@link IRuntimeProvider}, backed by SAP Integration Suite's documented
 * OData v1 Monitoring API (`IntegrationRuntimeArtifacts`) and its `DeployIntegrationDesigntimeArtifact`
 * deploy action (architecture: Runtime Provider, §8). `restartArtifact` reads the artifact's current
 * version, then redeploys it — CPI has no separate "restart" verb; requesting a fresh deploy of the
 * already-deployed version is the documented equivalent.
 */
export class RealRuntimeProvider implements IRuntimeProvider {
  private readonly odataClient: ODataClient;
  private readonly restClient: SdkRestClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async listArtifacts(context: ProviderContext): Promise<readonly RuntimeArtifactStatus[]> {
    return this.pipeline.run({
      operationName: "runtime.listArtifacts",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiIntegrationRuntimeArtifact>(
          `${tenant.baseUrl}/IntegrationRuntimeArtifacts`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return items.map(RealRuntimeProvider.toDomain);
      },
    });
  }

  /** @inheritdoc */
  public async getArtifact(
    context: ProviderContext,
    artifactId: string,
  ): Promise<RuntimeArtifactStatus | undefined> {
    return this.pipeline.run({
      operationName: "runtime.getArtifact",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.fetchArtifact(artifactId, tenant, opContext);
        return raw === undefined ? undefined : RealRuntimeProvider.toDomain(raw);
      },
    });
  }

  /** @inheritdoc */
  public async restartArtifact(context: ProviderContext, artifactId: string): Promise<void> {
    return this.pipeline.run({
      operationName: "runtime.restartArtifact",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.fetchArtifact(artifactId, tenant, opContext);
        if (raw === undefined) {
          throw HttpError.notFound(`Runtime artifact "${artifactId}" is not deployed.`);
        }
        await this.restClient.post(
          `${tenant.baseUrl}/DeployIntegrationDesigntimeArtifact`,
          undefined,
          opContext,
          {
            headers: tenant.headers,
            query: { Id: toODataV2KeyLiteral(raw.Id), Version: toODataV2KeyLiteral(raw.Version) },
          },
        );
      },
    });
  }

  private fetchArtifact(
    artifactId: string,
    tenant: TenantContext,
    opContext: OperationContext,
  ): Promise<CpiIntegrationRuntimeArtifact | undefined> {
    return this.odataClient.getEntity<CpiIntegrationRuntimeArtifact>(
      `${tenant.baseUrl}/IntegrationRuntimeArtifacts(${toODataV2KeyLiteral(artifactId)})`,
      tenant,
      opContext,
    );
  }

  private static toDomain(raw: CpiIntegrationRuntimeArtifact): RuntimeArtifactStatus {
    return {
      artifactId: raw.Id,
      name: raw.Name,
      type: raw.Type,
      version: raw.Version,
      status: raw.Status,
      deployedOn: parseODataV2DateTime(raw.DeployedOn),
      deployedBy: raw.DeployedBy,
      errorText: raw.ErrorInformation,
    };
  }
}
