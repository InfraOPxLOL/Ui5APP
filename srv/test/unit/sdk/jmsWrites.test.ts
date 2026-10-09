import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RequestPipeline } from "../../../src/sdk/pipeline/RequestPipeline.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import { RealJmsProvider } from "../../../src/sdk/providers/RealJmsProvider.js";
import { toCookieHeader } from "../../../src/sdk/rest/CsrfHandshake.js";
import type { ProviderContext } from "../../../src/core/providers/types.js";

const context: ProviderContext = { tenantId: "primary", correlationId: "corr-1" };

const tenant: TenantContext = {
  tenantId: "primary",
  baseUrl: "https://cpi.example.test/api/v1",
  headers: { Authorization: "Bearer tok" },
  destinationName: "D1",
};

const stubResolver: IDestinationResolver = {
  resolve: () => Promise.resolve(tenant),
  listEnvironments: () => Promise.resolve(["development"]),
};

function response(status: number, body?: unknown, headers?: Record<string, string>): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers ?? {})),
    bodyText: body === undefined ? undefined : JSON.stringify(body),
    attempts: 1,
    durationMs: 1,
  };
}

/**
 * A tenant that, like Cloud Integration, rejects any write without the token it issued — and only
 * accepts the token together with both session cookies it was bound to.
 */
function csrfTenant(writeReply: HttpResponse): {
  readonly httpClient: IHttpClient;
  readonly requests: HttpRequestOptions[];
} {
  const requests: HttpRequestOptions[] = [];
  const httpClient: IHttpClient = {
    execute: (options) => {
      requests.push(options);
      if (options.method === "GET" && options.headers?.["X-CSRF-Token"] === "Fetch") {
        return Promise.resolve(
          response(
            200,
            {},
            {
              "x-csrf-token": "tok-123",
              "set-cookie":
                "JSESSIONID=abc; Path=/; Secure; HttpOnly\n__VCAP_ID__=xyz; Path=/; Secure",
            },
          ),
        );
      }
      const valid =
        options.headers?.["X-CSRF-Token"] === "tok-123" &&
        options.headers.Cookie === "JSESSIONID=abc; __VCAP_ID__=xyz";
      return Promise.resolve(valid ? writeReply : response(403));
    },
  };
  return { httpClient, requests };
}

describe("sdk/rest/CsrfHandshake", () => {
  it("replays every Set-Cookie as name=value pairs and drops their attributes", () => {
    assert.equal(
      toCookieHeader(
        "JSESSIONID=abc; Path=/; HttpOnly\n__VCAP_ID__=xyz; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
      ),
      "JSESSIONID=abc; __VCAP_ID__=xyz",
    );
    assert.equal(toCookieHeader("JSESSIONID=abc"), "JSESSIONID=abc");
    assert.equal(toCookieHeader(undefined), undefined);
    assert.equal(toCookieHeader(""), undefined);
  });
});

describe("sdk/providers/RealJmsProvider writes", () => {
  it("moveMessages fetches a CSRF token first and replays it with both session cookies", async () => {
    const { httpClient, requests } = csrfTenant(
      response(200, { operation: "MOVE", processedCount: "1" }),
    );
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);

    const result = await provider.moveMessages(context, "DLQ", "INBOUND_Q", ["ID:1"]);

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, `${tenant.baseUrl}/`);
    assert.equal(requests[1]?.method, "POST");
    assert.equal(requests[1]?.url, `${tenant.baseUrl}/MoveMessagingMessages`);
    assert.equal(requests[1]?.headers?.Authorization, "Bearer tok");
    assert.deepEqual(result, { processedCount: 1 }, "the Int64-as-string count is parsed");
  });

  it("retryMessage sends the token and reports the tenant's processed count", async () => {
    const { httpClient, requests } = csrfTenant(
      response(200, { operation: "RETRY", processedCount: 0 }),
    );
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);

    const result = await provider.retryMessage(context, "INBOUND_Q", "ID:1");

    assert.equal(requests.at(-1)?.url, `${tenant.baseUrl}/RetryMessagingMessages`);
    assert.deepEqual(result, { processedCount: 0 });
  });

  it("reports an unknown count when the reply carries none", async () => {
    const { httpClient } = csrfTenant(response(204));
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    assert.deepEqual(await provider.moveMessages(context, "DLQ", "INBOUND_Q", ["ID:1"]), {
      processedCount: undefined,
    });
  });

  it("deleteMessage sends the token too", async () => {
    const { httpClient, requests } = csrfTenant(
      response(200, { operation: "DELETE", processedCount: 1 }),
    );
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    await provider.deleteMessage(context, "DLQ", "ID:1");
    assert.equal(requests.at(-1)?.method, "DELETE");
  });

  it("surfaces the OData error text of a rejected move", async () => {
    const { httpClient } = csrfTenant(
      response(400, {
        error: { code: "INVALID_INPUT", message: { lang: "en", value: "Unknown field 'foo'." } },
      }),
    );
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    await assert.rejects(
      provider.moveMessages(context, "DLQ", "INBOUND_Q", ["ID:1"]),
      /Unknown field 'foo'\./,
    );
  });
});

describe("sdk/providers/RealJmsProvider payloads", () => {
  function payloadTenant(reply: HttpResponse): {
    readonly httpClient: IHttpClient;
    readonly urls: string[];
  } {
    const urls: string[] = [];
    return {
      urls,
      httpClient: {
        execute: (options) => {
          urls.push(options.url);
          return Promise.resolve(reply);
        },
      },
    };
  }

  function binary(bytes: Uint8Array): HttpResponse {
    return {
      status: 200,
      ok: true,
      headers: new Map(),
      bodyBinary: bytes,
      attempts: 1,
      durationMs: 1,
    };
  }

  it("reads the body from the message's $value and shows readable text as text", async () => {
    const edi = "ISA*00*~GS*PO~ST*850*0001~";
    const { httpClient, urls } = payloadTenant(binary(new TextEncoder().encode(edi)));
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);

    const payload = await provider.getMessagePayload(context, "DLQ", "ID:1");

    assert.equal(
      urls[0],
      `${tenant.baseUrl}/MessagingMessages(jmsMessageId='ID:1',queueName='DLQ')/$value`,
    );
    assert.deepEqual(payload, { content: edi, encoding: "text", sizeBytes: edi.length });
  });

  it("returns non-text bytes as base64", async () => {
    const { httpClient } = payloadTenant(binary(new Uint8Array([0x1f, 0x8b, 0x00, 0xff])));
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    const payload = await provider.getMessagePayload(context, "DLQ", "ID:1");
    assert.equal(payload?.encoding, "base64");
    assert.equal(payload?.content, "H4sA/w==");
    assert.equal(payload?.sizeBytes, 4);
  });

  it("reads a message that left the queue as absent", async () => {
    const { httpClient } = payloadTenant(response(404));
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    assert.equal(await provider.getMessagePayload(context, "DLQ", "ID:1"), undefined);
  });
});
