import type { IHttpClient } from "../http/IHttpClient.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { TenantContext } from "../models/TenantContext.js";
import type { ODataResponse } from "../models/ODataResponse.js";
import type { PagedResponse } from "../models/PagedResponse.js";
import type { BatchResponse } from "../models/BatchResponse.js";
import type { ODataVersion } from "./ODataTypes.js";
import type { ODataQueryBuilder } from "./ODataQueryBuilder.js";
import type { ODataBatchBuilder } from "./ODataBatchBuilder.js";
import { ODataResponseParser } from "./ODataResponseParser.js";
import { ODataBatchResponseParser } from "./ODataBatchResponseParser.js";
import { HttpErrorTranslator } from "../errors/HttpErrorTranslator.js";
import { ODataError } from "../errors/ODataError.js";
import type { ErrorResponse } from "../models/ErrorResponse.js";

/** Safety cap on {@link ODataClient.queryAllPages} so a misbehaving `nextLink` chain cannot loop forever. */
const MAX_AUTO_PAGES = 100;

/**
 * The SDK's real OData client (architecture: OData Framework, §5 — "Real OData client").
 *
 * Ties together the framework's individual pieces (`ODataQueryBuilder`, `ODataResponseParser`,
 * `ODataMetadataParser`, `ODataBatchBuilder`/`ODataBatchResponseParser`) into the single seam a
 * provider calls: build a query, send it over the injected {@link IHttpClient} (which already
 * supplies retry, timeout and compression per the HTTP Infrastructure layer — this class adds
 * nothing transport-level of its own), and parse the result. Every non-2xx response is translated
 * through {@link HttpErrorTranslator}; every malformed body is translated by
 * {@link ODataResponseParser} into a typed `ODataError` — callers never see a raw status code or a
 * `SyntaxError`.
 */
export class ODataClient {
  public constructor(
    private readonly httpClient: IHttpClient,
    private readonly version: ODataVersion = "v2",
  ) {}

  /**
   * Executes one OData query against an entity-set URL.
   * @param entitySetUrl the absolute entity-set URL (tenant base URL + entity-set path).
   * @param builder the accumulated query options.
   * @param tenant the resolved tenant connectivity (base URL + auth headers).
   * @param context the operation context.
   * @returns the normalized OData response.
   */
  public async query<T>(
    entitySetUrl: string,
    builder: ODataQueryBuilder,
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<ODataResponse<T>> {
    const response = await this.httpClient.execute(
      {
        method: "GET",
        url: entitySetUrl,
        headers: ODataClient.jsonHeaders(tenant),
        query: builder.build(this.version),
      },
      context,
    );
    ODataClient.assertOk(tenant.tenantId, response.status, response.ok, response.bodyText);
    return ODataResponseParser.parse<T>(
      response.bodyText ?? "",
      context.request.correlationId,
      response.durationMs,
    );
  }

  /**
   * Executes one OData query and converts the result into the platform-standard
   * {@link PagedResponse}.
   * @param entitySetUrl the absolute entity-set URL.
   * @param builder the accumulated query options (its `$top`/`$skip` are echoed back into the page).
   * @param tenant the resolved tenant connectivity.
   * @param context the operation context.
   * @param page the `$skip`/`$top` that were requested (OData responses don't echo these back).
   * @returns the equivalent paged response.
   */
  public async queryPage<T>(
    entitySetUrl: string,
    builder: ODataQueryBuilder,
    tenant: TenantContext,
    context: OperationContext,
    page: { readonly skip: number; readonly top: number },
  ): Promise<PagedResponse<T>> {
    const response = await this.query<T>(entitySetUrl, builder, tenant, context);
    return ODataResponseParser.toPagedResponse(response, page.skip, page.top);
  }

  /**
   * Follows `nextLink`/`__next` continuation automatically, accumulating every page's items into a
   * single array (architecture: OData Framework, §5 — "Automatic paging", "Continuation tokens").
   * @param entitySetUrl the absolute entity-set URL for the first page.
   * @param builder the query options for the first page.
   * @param tenant the resolved tenant connectivity.
   * @param context the operation context.
   * @returns every item across all followed pages.
   */
  public async queryAllPages<T>(
    entitySetUrl: string,
    builder: ODataQueryBuilder,
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<readonly T[]> {
    const items: T[] = [];
    let response = await this.query<T>(entitySetUrl, builder, tenant, context);
    items.push(...response.value);
    let pages = 1;
    while (response.nextLink !== undefined && pages < MAX_AUTO_PAGES) {
      const nextUrl = ODataClient.resolveNextLink(entitySetUrl, response.nextLink);
      const httpResponse = await this.httpClient.execute(
        { method: "GET", url: nextUrl, headers: ODataClient.jsonHeaders(tenant) },
        context,
      );
      ODataClient.assertOk(
        tenant.tenantId,
        httpResponse.status,
        httpResponse.ok,
        httpResponse.bodyText,
      );
      response = ODataResponseParser.parse<T>(
        httpResponse.bodyText ?? "",
        context.request.correlationId,
        httpResponse.durationMs,
      );
      items.push(...response.value);
      pages += 1;
    }
    return items;
  }

  /**
   * Reads a single entity by its absolute (key-qualified) URL.
   * @param entityUrl the absolute entity URL, e.g. `{base}/Things('id')`.
   * @param tenant the resolved tenant connectivity.
   * @param context the operation context.
   * @returns the parsed entity, or `undefined` on a 404.
   */
  public async getEntity<T>(
    entityUrl: string,
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<T | undefined> {
    const response = await this.httpClient.execute(
      { method: "GET", url: entityUrl, headers: ODataClient.jsonHeaders(tenant) },
      context,
    );
    if (response.status === 404) {
      return undefined;
    }
    ODataClient.assertOk(tenant.tenantId, response.status, response.ok, response.bodyText);
    if (response.bodyText === undefined || response.bodyText === "") {
      return undefined;
    }
    return this.parseEntity<T>(response.bodyText);
  }

  /**
   * Fetches a service's raw `$metadata` (EDMX) document; pair with `ODataMetadataParser` to extract
   * entity types (architecture: OData Framework, §5 — "Metadata parsing").
   * @param serviceUrl the OData service root URL (metadata is served at `{serviceUrl}/$metadata`).
   * @param tenant the resolved tenant connectivity.
   * @param context the operation context.
   * @returns the raw metadata XML text.
   */
  public async getMetadata(
    serviceUrl: string,
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<string> {
    const response = await this.httpClient.execute(
      {
        method: "GET",
        url: `${serviceUrl}/$metadata`,
        headers: tenant.headers,
      },
      context,
    );
    ODataClient.assertOk(tenant.tenantId, response.status, response.ok, response.bodyText);
    return response.bodyText ?? "";
  }

  /**
   * Submits an OData `$batch` request (architecture: OData Framework, §5 — "Batch requests").
   * @param serviceUrl the OData service root URL (batch requests post to `{serviceUrl}/$batch`).
   * @param builder the accumulated batch operations.
   * @param tenant the resolved tenant connectivity.
   * @param context the operation context.
   * @returns the normalized batch response, one result per submitted operation, in order.
   */
  public async batch<T>(
    serviceUrl: string,
    builder: ODataBatchBuilder,
    tenant: TenantContext,
    context: OperationContext,
  ): Promise<BatchResponse<T>> {
    const request = builder.build();
    const response = await this.httpClient.execute(
      {
        method: "POST",
        url: `${serviceUrl}/$batch`,
        headers: { ...tenant.headers, "Content-Type": request.contentType },
        body: { encoding: "text", value: request.body },
      },
      context,
    );
    ODataClient.assertOk(tenant.tenantId, response.status, response.ok, response.bodyText);
    const contentTypeHeader = response.headers.get("content-type") ?? request.contentType;
    return ODataBatchResponseParser.parse<T>(
      response.bodyText ?? "",
      contentTypeHeader,
      context.request.correlationId,
      response.durationMs,
    );
  }

  /**
   * Parses a single-entity response body, unwrapping OData v2's `{ d: {...} }` envelope (v2 wraps
   * single entities the same way it wraps collections in `d.results`; v4 does not wrap them at all).
   */
  private parseEntity<T>(bodyText: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch (cause) {
      throw new ODataError(
        "The OData entity response body is not valid JSON.",
        { bodyText },
        cause,
      );
    }
    if (this.version === "v2" && parsed !== null && typeof parsed === "object" && "d" in parsed) {
      return (parsed as { d: T }).d;
    }
    return parsed as T;
  }

  private static assertOk(
    tenantId: string,
    status: number,
    ok: boolean,
    bodyText: string | undefined,
  ): void {
    if (ok) {
      return;
    }
    const errorResponse: ErrorResponse = {
      httpStatus: status,
      message: `The OData request for tenant "${tenantId}" failed with status ${status}.`,
      rawBody: bodyText,
    };
    throw HttpErrorTranslator.translate(tenantId, errorResponse);
  }

  /**
   * Merges an explicit `Accept: application/json` onto a tenant's auth/destination headers.
   *
   * Without this, `fetch` sends no `Accept` header at all, and SAP Integration Suite's OData v1
   * Monitoring/Security Content API — built on an older Apache CXF/Olingo stack — falls back to its
   * default Atom/XML representation rather than JSON. `ODataResponseParser` then fails to
   * `JSON.parse` the XML body, surfacing as "The OData response body is not valid JSON." even though
   * the request itself (auth, URL, tenant) was entirely correct. Every JSON-expecting GET goes
   * through this helper; `getMetadata` (which wants the EDMX XML) and `batch` (multipart) do not.
   */
  private static jsonHeaders(tenant: TenantContext): Record<string, string> {
    return { ...tenant.headers, Accept: "application/json" };
  }

  private static resolveNextLink(entitySetUrl: string, nextLink: string): string {
    try {
      return new URL(nextLink).toString();
    } catch {
      return new URL(nextLink, entitySetUrl).toString();
    }
  }
}
