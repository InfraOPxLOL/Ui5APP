import type { IValueMappingProvider } from "../../core/providers/IValueMappingProvider.js";
import type { ProviderContext, ValueMappingScheme } from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Raw shape of one Value Mapping design-time artifact summary. */
interface CpiValueMappingSummary {
  readonly Name: string;
  readonly Description?: string;
}

/**
 * The entity-set name this provider queries — configurable for the same reason as
 * {@link JmsProviderEndpoints} (see `RealJmsProvider`): less universally stable across tenant
 * versions than the core Monitoring API.
 */
export interface ValueMappingProviderEndpoints {
  readonly schemesEntitySet: string;
}

const DEFAULT_VALUE_MAPPING_ENDPOINTS: ValueMappingProviderEndpoints = {
  schemesEntitySet: "ValueMappingDesigntimeArtifacts",
};

/**
 * Live implementation of {@link IValueMappingProvider} (architecture: Value Mapping Provider, §10 —
 * "Read only. No editing.").
 *
 * SAP Integration Suite's public API surface for Value Mapping exposes design-time artifact
 * *metadata* (scheme name/description) but not per-entry mapping content without downloading and
 * unpacking the deployed artifact's content archive — out of scope for a REST/OData-only client.
 * Schemes are therefore returned with an accurate `name`/`description` and an empty `agencies` list;
 * this is a documented real-world limitation, not a bug — a future phase can populate `agencies` by
 * adding artifact-content parsing without changing this contract.
 */
export class RealValueMappingProvider implements IValueMappingProvider {
  private readonly odataClient: ODataClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
    private readonly endpoints: ValueMappingProviderEndpoints = DEFAULT_VALUE_MAPPING_ENDPOINTS,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
  }

  /** @inheritdoc */
  public async listSchemes(context: ProviderContext): Promise<readonly ValueMappingScheme[]> {
    return this.pipeline.run({
      operationName: "valueMapping.listSchemes",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiValueMappingSummary>(
          `${tenant.baseUrl}/${this.endpoints.schemesEntitySet}`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return items.map(RealValueMappingProvider.toDomain);
      },
    });
  }

  /** @inheritdoc */
  public async getScheme(
    context: ProviderContext,
    schemeName: string,
  ): Promise<ValueMappingScheme | undefined> {
    return this.pipeline.run({
      operationName: "valueMapping.getScheme",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.getEntity<CpiValueMappingSummary>(
          `${tenant.baseUrl}/${this.endpoints.schemesEntitySet}(${toODataV2KeyLiteral(schemeName)})`,
          tenant,
          opContext,
        );
        return raw === undefined ? undefined : RealValueMappingProvider.toDomain(raw);
      },
    });
  }

  private static toDomain(raw: CpiValueMappingSummary): ValueMappingScheme {
    return { name: raw.Name, description: raw.Description, agencies: [] };
  }
}
