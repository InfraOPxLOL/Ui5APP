import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ODataClient } from "../../../src/sdk/odata/ODataClient.js";
import { ODataQueryBuilder } from "../../../src/sdk/odata/ODataQueryBuilder.js";
import { ODataBatchBuilder } from "../../../src/sdk/odata/ODataBatchBuilder.js";
import { createOperationContext } from "../../../src/sdk/models/OperationContext.js";
import { createRequestContext } from "../../../src/sdk/models/RequestContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";

const tenant: TenantContext = {
  tenantId: "primary",
  baseUrl: "https://cpi.example.test/api/v1",
  headers: { Authorization: "Bearer tok" },
  destinationName: "D1",
};

function newContext() {
  return createOperationContext(
    createRequestContext("primary", { correlationId: "corr-1" }),
    "test.op",
  );
}

function okResponse(bodyText: string, headers: Record<string, string> = {}): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(Object.entries(headers)),
    bodyText,
    attempts: 1,
    durationMs: 5,
  };
}

function fakeHttpClient(handler: (options: HttpRequestOptions) => HttpResponse): IHttpClient {
  return { execute: (options) => Promise.resolve(handler(options)) };
}

describe("sdk/odata/ODataClient", () => {
  it("query() sends the built query params and parses a v2 envelope", async () => {
    let capturedQuery: HttpRequestOptions["query"];
    const httpClient = fakeHttpClient((options) => {
      capturedQuery = options.query;
      return okResponse(JSON.stringify({ d: { results: [{ id: 1 }], __count: "1" } }));
    });
    const client = new ODataClient(httpClient, "v2");
    const builder = new ODataQueryBuilder().top(10).skip(0).count();
    const response = await client.query(`${tenant.baseUrl}/Things`, builder, tenant, newContext());

    assert.deepEqual(response.value, [{ id: 1 }]);
    assert.equal(response.count, 1);
    assert.deepEqual(capturedQuery, { $top: 10, $skip: 0, $inlinecount: "allpages" });
  });

  it("query() sends Accept: application/json alongside the tenant's auth headers", async () => {
    // Regression test: without an explicit Accept header, SAP Integration Suite's OData v1 API
    // (Apache CXF/Olingo-based) falls back to Atom/XML, which then fails JSON parsing downstream.
    let capturedHeaders: HttpRequestOptions["headers"];
    const httpClient = fakeHttpClient((options) => {
      capturedHeaders = options.headers;
      return okResponse(JSON.stringify({ d: { results: [] } }));
    });
    const client = new ODataClient(httpClient, "v2");
    await client.query(`${tenant.baseUrl}/Things`, new ODataQueryBuilder(), tenant, newContext());
    assert.equal(capturedHeaders?.Accept, "application/json");
    assert.equal(capturedHeaders?.Authorization, "Bearer tok");
  });

  it("getEntity() sends Accept: application/json", async () => {
    let capturedHeaders: HttpRequestOptions["headers"];
    const httpClient = fakeHttpClient((options) => {
      capturedHeaders = options.headers;
      return okResponse(JSON.stringify({ d: { id: 1 } }));
    });
    const client = new ODataClient(httpClient, "v2");
    await client.getEntity(`${tenant.baseUrl}/Things('x')`, tenant, newContext());
    assert.equal(capturedHeaders?.Accept, "application/json");
  });

  it("queryAllPages() sends Accept: application/json on every followed page", async () => {
    const capturedHeaders: HttpRequestOptions["headers"][] = [];
    let calls = 0;
    const httpClient = fakeHttpClient((options) => {
      capturedHeaders.push(options.headers);
      calls += 1;
      if (calls === 1) {
        return okResponse(
          JSON.stringify({
            value: [{ id: 1 }],
            "@odata.nextLink": "https://cpi.example.test/api/v1/Things?$skip=1",
          }),
        );
      }
      return okResponse(JSON.stringify({ value: [{ id: 2 }] }));
    });
    const client = new ODataClient(httpClient, "v4");
    await client.queryAllPages(
      `${tenant.baseUrl}/Things`,
      new ODataQueryBuilder(),
      tenant,
      newContext(),
    );
    assert.equal(capturedHeaders.length, 2);
    for (const headers of capturedHeaders) {
      assert.equal(headers?.Accept, "application/json");
    }
  });

  it("queryPage() converts to a PagedResponse using the requested skip/top", async () => {
    const httpClient = fakeHttpClient(() =>
      okResponse(JSON.stringify({ value: [{ id: 1 }], "@odata.count": 5 })),
    );
    const client = new ODataClient(httpClient, "v4");
    const page = await client.queryPage(
      `${tenant.baseUrl}/Things`,
      new ODataQueryBuilder(),
      tenant,
      newContext(),
      { skip: 0, top: 10 },
    );
    assert.equal(page.total, 5);
    assert.equal(page.skip, 0);
    assert.equal(page.top, 10);
  });

  it("queryAllPages() follows nextLink until exhausted", async () => {
    let calls = 0;
    const httpClient = fakeHttpClient(() => {
      calls += 1;
      if (calls === 1) {
        return okResponse(
          JSON.stringify({
            value: [{ id: 1 }],
            "@odata.nextLink": "https://cpi.example.test/api/v1/Things?$skip=1",
          }),
        );
      }
      return okResponse(JSON.stringify({ value: [{ id: 2 }] }));
    });
    const client = new ODataClient(httpClient, "v4");
    const items = await client.queryAllPages(
      `${tenant.baseUrl}/Things`,
      new ODataQueryBuilder(),
      tenant,
      newContext(),
    );
    assert.deepEqual(items, [{ id: 1 }, { id: 2 }]);
    assert.equal(calls, 2);
  });

  it("getEntity() returns undefined on a 404", async () => {
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve({ status: 404, ok: false, headers: new Map(), attempts: 1, durationMs: 1 }),
    };
    const client = new ODataClient(httpClient, "v2");
    const result = await client.getEntity(`${tenant.baseUrl}/Things('x')`, tenant, newContext());
    assert.equal(result, undefined);
  });

  it("query() throws a typed error for a non-2xx response", async () => {
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve({
          status: 500,
          ok: false,
          headers: new Map(),
          bodyText: "{}",
          attempts: 1,
          durationMs: 1,
        }),
    };
    const client = new ODataClient(httpClient, "v2");
    await assert.rejects(() =>
      client.query(`${tenant.baseUrl}/Things`, new ODataQueryBuilder(), tenant, newContext()),
    );
  });

  it("query() throws a typed ODataError for a malformed body", async () => {
    const httpClient = fakeHttpClient(() => okResponse("not json"));
    const client = new ODataClient(httpClient, "v2");
    await assert.rejects(
      () => client.query(`${tenant.baseUrl}/Things`, new ODataQueryBuilder(), tenant, newContext()),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "ODATA_MALFORMED_RESPONSE");
        return true;
      },
    );
  });

  it("getMetadata() fetches $metadata", async () => {
    const httpClient = fakeHttpClient(() => okResponse("<edmx:Edmx></edmx:Edmx>"));
    const client = new ODataClient(httpClient, "v2");
    const xml = await client.getMetadata(tenant.baseUrl, tenant, newContext());
    assert.ok(xml.includes("Edmx"));
  });

  it("batch() posts the built batch body and parses the multipart response", async () => {
    const httpClient = fakeHttpClient(() =>
      okResponse(
        '--batch_1\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\n\r\n{"ok":true}\r\n--batch_1--',
        { "content-type": "multipart/mixed;boundary=batch_1" },
      ),
    );
    const client = new ODataClient(httpClient, "v2");
    const builder = new ODataBatchBuilder().add({ method: "GET", url: "Things" });
    const response = await client.batch(tenant.baseUrl, builder, tenant, newContext());
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0]?.success, true);
  });
});
