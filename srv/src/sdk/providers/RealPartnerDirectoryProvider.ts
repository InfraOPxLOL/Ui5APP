import type { IPartnerDirectoryProvider } from "../../core/providers/IPartnerDirectoryProvider.js";
import type {
  PartnerDirectoryBinaryParameter,
  PartnerDirectoryStringParameter,
  ProviderContext,
} from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { TenantContext } from "../models/TenantContext.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { ODataFilter } from "../odata/ODataFilter.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { parseODataV2DateTime, toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Raw shape of one `StringParameters` entity (OData v2; `LastModifiedTime` is `/Date(ms)/`). */
interface CpiStringParameter {
  readonly Pid: string;
  readonly Id: string;
  readonly Value: string;
  readonly LastModifiedBy?: string;
  readonly LastModifiedTime?: string;
}

/**
 * Raw shape of one `BinaryParameters` entity (OData v2; `LastModifiedTime` is `/Date(ms)/`). `Value`
 * has no `m:HasStream` on the entity type, so it travels as a plain base64 string, same as any other
 * JSON field — no separate `$value` media-resource fetch is needed.
 */
interface CpiBinaryParameter {
  readonly Pid: string;
  readonly Id: string;
  readonly ContentType: string;
  readonly Value: string;
  readonly LastModifiedBy?: string;
  readonly LastModifiedTime?: string;
}

/** The CSRF token + session cookie captured from a `X-CSRF-Token: Fetch` handshake. */
interface CsrfHandshake {
  readonly token: string | undefined;
  readonly cookie: string | undefined;
}

/**
 * Live implementation of {@link IPartnerDirectoryProvider}, backed by SAP Integration Suite's
 * Partner Directory `StringParameters` OData v2 entity set (key `(Pid, Id)`), confirmed present in
 * the tenant `$metadata`.
 *
 * Writes (POST/PUT) require a CSRF token on CPI: every write first performs a
 * `X-CSRF-Token: Fetch` handshake against the service root and replays the returned token (and any
 * session cookie) on the modifying request — handled here so no engine/module ever sees a token.
 */
export class RealPartnerDirectoryProvider implements IPartnerDirectoryProvider {
  private readonly odataClient: ODataClient;
  private readonly restClient: SdkRestClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    private readonly httpClient: IHttpClient,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async getStringParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryStringParameter | undefined> {
    return this.pipeline.run({
      operationName: "partnerDirectory.getStringParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.getEntity<CpiStringParameter>(
          this.parameterUrl(tenant, pid, id),
          tenant,
          opContext,
        );
        return raw === undefined ? undefined : RealPartnerDirectoryProvider.toDomain(raw);
      },
    });
  }

  /** @inheritdoc */
  public async listStringParameters(
    context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryStringParameter[]> {
    return this.pipeline.run({
      operationName: "partnerDirectory.listStringParameters",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiStringParameter>(
          `${tenant.baseUrl}/StringParameters`,
          new ODataQueryBuilder().filter(ODataFilter.eq("Pid", pid)),
          tenant,
          opContext,
        );
        return items.map(RealPartnerDirectoryProvider.toDomain);
      },
    });
  }

  /** @inheritdoc */
  public async upsertStringParameter(
    context: ProviderContext,
    parameter: { readonly pid: string; readonly id: string; readonly value: string },
  ): Promise<PartnerDirectoryStringParameter> {
    return this.pipeline.run({
      operationName: "partnerDirectory.upsertStringParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const existing = await this.odataClient.getEntity<CpiStringParameter>(
          this.parameterUrl(tenant, parameter.pid, parameter.id),
          tenant,
          opContext,
        );
        const csrf = await this.fetchCsrf(tenant, opContext);
        const headers = RealPartnerDirectoryProvider.writeHeaders(tenant, csrf);
        const body = { Pid: parameter.pid, Id: parameter.id, Value: parameter.value };
        if (existing === undefined) {
          await this.restClient.post(`${tenant.baseUrl}/StringParameters`, body, opContext, {
            headers,
          });
        } else {
          await this.restClient.put(
            this.parameterUrl(tenant, parameter.pid, parameter.id),
            body,
            opContext,
            { headers },
          );
        }
        // Read back so the caller sees the tenant's persisted value + audit fields, not our input.
        const persisted = await this.odataClient.getEntity<CpiStringParameter>(
          this.parameterUrl(tenant, parameter.pid, parameter.id),
          tenant,
          opContext,
        );
        return persisted === undefined
          ? {
              pid: parameter.pid,
              id: parameter.id,
              value: parameter.value,
              lastModifiedBy: undefined,
              lastModifiedAt: undefined,
            }
          : RealPartnerDirectoryProvider.toDomain(persisted);
      },
    });
  }

  /** @inheritdoc */
  public async deleteStringParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<void> {
    return this.pipeline.run({
      operationName: "partnerDirectory.deleteStringParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const existing = await this.odataClient.getEntity<CpiStringParameter>(
          this.parameterUrl(tenant, pid, id),
          tenant,
          opContext,
        );
        if (existing === undefined) {
          return;
        }
        const csrf = await this.fetchCsrf(tenant, opContext);
        await this.restClient.delete(this.parameterUrl(tenant, pid, id), opContext, {
          headers: RealPartnerDirectoryProvider.writeHeaders(tenant, csrf),
        });
      },
    });
  }

  /** @inheritdoc */
  public async getBinaryParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryBinaryParameter | undefined> {
    return this.pipeline.run({
      operationName: "partnerDirectory.getBinaryParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.getEntity<CpiBinaryParameter>(
          this.binaryParameterUrl(tenant, pid, id),
          tenant,
          opContext,
        );
        return raw === undefined ? undefined : RealPartnerDirectoryProvider.toBinaryDomain(raw);
      },
    });
  }

  /** @inheritdoc */
  public async listBinaryParameters(
    context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryBinaryParameter[]> {
    return this.pipeline.run({
      operationName: "partnerDirectory.listBinaryParameters",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiBinaryParameter>(
          `${tenant.baseUrl}/BinaryParameters`,
          new ODataQueryBuilder().filter(ODataFilter.eq("Pid", pid)),
          tenant,
          opContext,
        );
        return items.map(RealPartnerDirectoryProvider.toBinaryDomain);
      },
    });
  }

  /** @inheritdoc */
  public async upsertBinaryParameter(
    context: ProviderContext,
    parameter: {
      readonly pid: string;
      readonly id: string;
      readonly contentType: string;
      readonly valueBase64: string;
    },
  ): Promise<PartnerDirectoryBinaryParameter> {
    return this.pipeline.run({
      operationName: "partnerDirectory.upsertBinaryParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const existing = await this.odataClient.getEntity<CpiBinaryParameter>(
          this.binaryParameterUrl(tenant, parameter.pid, parameter.id),
          tenant,
          opContext,
        );
        const csrf = await this.fetchCsrf(tenant, opContext);
        const headers = RealPartnerDirectoryProvider.writeHeaders(tenant, csrf);
        const body = {
          Pid: parameter.pid,
          Id: parameter.id,
          ContentType: parameter.contentType,
          Value: parameter.valueBase64,
        };
        if (existing === undefined) {
          await this.restClient.post(`${tenant.baseUrl}/BinaryParameters`, body, opContext, {
            headers,
          });
        } else {
          await this.restClient.put(
            this.binaryParameterUrl(tenant, parameter.pid, parameter.id),
            body,
            opContext,
            { headers },
          );
        }
        // Read back so the caller sees the tenant's persisted value + audit fields, not our input.
        const persisted = await this.odataClient.getEntity<CpiBinaryParameter>(
          this.binaryParameterUrl(tenant, parameter.pid, parameter.id),
          tenant,
          opContext,
        );
        return persisted === undefined
          ? {
              pid: parameter.pid,
              id: parameter.id,
              contentType: parameter.contentType,
              valueBase64: parameter.valueBase64,
              lastModifiedBy: undefined,
              lastModifiedAt: undefined,
            }
          : RealPartnerDirectoryProvider.toBinaryDomain(persisted);
      },
    });
  }

  /** @inheritdoc */
  public async deleteBinaryParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<void> {
    return this.pipeline.run({
      operationName: "partnerDirectory.deleteBinaryParameter",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const existing = await this.odataClient.getEntity<CpiBinaryParameter>(
          this.binaryParameterUrl(tenant, pid, id),
          tenant,
          opContext,
        );
        if (existing === undefined) {
          return;
        }
        const csrf = await this.fetchCsrf(tenant, opContext);
        await this.restClient.delete(this.binaryParameterUrl(tenant, pid, id), opContext, {
          headers: RealPartnerDirectoryProvider.writeHeaders(tenant, csrf),
        });
      },
    });
  }

  /**
   * Performs the CPI CSRF handshake: a GET on the service root with `X-CSRF-Token: Fetch`, reading
   * the issued token and any session cookie from the response headers (both keyed lower-case by the
   * HTTP layer). Best-effort — a tenant that doesn't require CSRF simply returns no token, and the
   * subsequent write proceeds without one.
   */
  private async fetchCsrf(
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<CsrfHandshake> {
    const response = await this.httpClient.execute(
      {
        method: "GET",
        url: `${tenant.baseUrl}/`,
        headers: { ...tenant.headers, Accept: "application/json", "X-CSRF-Token": "Fetch" },
      },
      context,
    );
    return {
      token: response.headers.get("x-csrf-token"),
      cookie: response.headers.get("set-cookie"),
    };
  }

  private parameterUrl(tenant: TenantContext, pid: string, id: string): string {
    return `${tenant.baseUrl}/StringParameters(Pid=${toODataV2KeyLiteral(pid)},Id=${toODataV2KeyLiteral(id)})`;
  }

  private binaryParameterUrl(tenant: TenantContext, pid: string, id: string): string {
    return `${tenant.baseUrl}/BinaryParameters(Pid=${toODataV2KeyLiteral(pid)},Id=${toODataV2KeyLiteral(id)})`;
  }

  private static writeHeaders(tenant: TenantContext, csrf: CsrfHandshake): Record<string, string> {
    const headers: Record<string, string> = { ...tenant.headers, Accept: "application/json" };
    if (csrf.token !== undefined) {
      headers["X-CSRF-Token"] = csrf.token;
    }
    if (csrf.cookie !== undefined) {
      headers.Cookie = csrf.cookie;
    }
    return headers;
  }

  private static toDomain(raw: CpiStringParameter): PartnerDirectoryStringParameter {
    return {
      pid: raw.Pid,
      id: raw.Id,
      value: raw.Value,
      lastModifiedBy: raw.LastModifiedBy,
      lastModifiedAt: parseODataV2DateTime(raw.LastModifiedTime),
    };
  }

  private static toBinaryDomain(raw: CpiBinaryParameter): PartnerDirectoryBinaryParameter {
    return {
      pid: raw.Pid,
      id: raw.Id,
      contentType: raw.ContentType,
      valueBase64: raw.Value,
      lastModifiedBy: raw.LastModifiedBy,
      lastModifiedAt: parseODataV2DateTime(raw.LastModifiedTime),
    };
  }
}
