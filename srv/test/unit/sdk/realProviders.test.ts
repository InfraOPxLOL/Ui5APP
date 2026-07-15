import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RequestPipeline } from "../../../src/sdk/pipeline/RequestPipeline.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import { RealMonitoringProvider } from "../../../src/sdk/providers/RealMonitoringProvider.js";
import { RealRuntimeProvider } from "../../../src/sdk/providers/RealRuntimeProvider.js";
import { RealPayloadProvider } from "../../../src/sdk/providers/RealPayloadProvider.js";
import { RealCertificateProvider } from "../../../src/sdk/providers/RealCertificateProvider.js";
import { RealJmsProvider } from "../../../src/sdk/providers/RealJmsProvider.js";
import { RealValueMappingProvider } from "../../../src/sdk/providers/RealValueMappingProvider.js";
import { RealAlertProvider } from "../../../src/sdk/providers/RealAlertProvider.js";
import { BasicAuthProvider } from "../../../src/sdk/auth/BasicAuthProvider.js";
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

/** A v2-shaped `d`-wrapped single-entity response. */
function entityResponse(entity: unknown): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify({ d: entity }),
    attempts: 1,
    durationMs: 1,
  };
}

/** A v2-shaped `d.results` collection response. */
function collectionResponse(results: readonly unknown[], count?: number): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify({
      d: { results, ...(count !== undefined ? { __count: String(count) } : {}) },
    }),
    attempts: 1,
    durationMs: 1,
  };
}

const NOT_FOUND_RESPONSE: HttpResponse = {
  status: 404,
  ok: false,
  headers: new Map(),
  attempts: 1,
  durationMs: 1,
};

describe("sdk/providers/RealMonitoringProvider", () => {
  it("queryMessageLogs builds the OData filter, parses /Date()/ values and maps fields", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        assert.ok(options.url.endsWith("/MessageProcessingLogs"));
        assert.equal(options.query?.$top, 5);
        assert.equal(options.query?.$filter, "Status eq 'FAILED'");
        return Promise.resolve(
          collectionResponse(
            [
              {
                MessageGuid: "m1",
                Status: "FAILED",
                LogStart: "/Date(1700000000000)/",
                LogEnd: "/Date(1700000005000)/",
              },
            ],
            1,
          ),
        );
      },
    };
    const provider = new RealMonitoringProvider(new RequestPipeline(stubResolver), httpClient);
    const page = await provider.queryMessageLogs(
      context,
      { status: "FAILED" },
      { skip: 0, top: 5 },
    );
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.messageId, "m1");
    assert.equal(page.items[0]?.startTime, new Date(1700000000000).toISOString());
    assert.equal(page.items[0]?.processingTimeMs, 5000);
  });

  it("getErrorDetails maps ErrorInformation into a single MessageErrorDetail", async () => {
    const httpClient: IHttpClient = {
      execute: () => Promise.resolve(entityResponse({ ErrorMessage: "boom" })),
    };
    const provider = new RealMonitoringProvider(new RequestPipeline(stubResolver), httpClient);
    const details = await provider.getErrorDetails(context, "m1");
    assert.equal(details.length, 1);
    assert.equal(details[0]?.text, "boom");
  });

  it("getMessageLog returns undefined for an unknown message id", async () => {
    const httpClient: IHttpClient = { execute: () => Promise.resolve(NOT_FOUND_RESPONSE) };
    const provider = new RealMonitoringProvider(new RequestPipeline(stubResolver), httpClient);
    assert.equal(await provider.getMessageLog(context, "missing"), undefined);
  });

  it("getCustomHeaders queries the CustomHeaderProperties nav collection and maps Name/Value", async () => {
    let capturedUrl: string | undefined;
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        return Promise.resolve(
          collectionResponse([
            { Id: "1", Name: "CH-Message-Queue", Value: "[QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]" },
            { Id: "2", Name: "SAP_ApplicationErrorCategory", Value: "NONE" },
          ]),
        );
      },
    };
    const provider = new RealMonitoringProvider(new RequestPipeline(stubResolver), httpClient);
    const headers = await provider.getCustomHeaders(context, "m1");
    assert.equal(
      capturedUrl,
      `${tenant.baseUrl}/MessageProcessingLogs('m1')/CustomHeaderProperties`,
    );
    assert.equal(headers.length, 2);
    assert.equal(headers[0]?.name, "CH-Message-Queue");
    assert.equal(headers[0]?.value, "[QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]");
  });
});

describe("sdk/providers/RealRuntimeProvider", () => {
  it("listArtifacts maps the raw Version field into the domain type", async () => {
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve(
          collectionResponse([
            {
              Id: "art1",
              Name: "Flow",
              Type: "INTEGRATION_FLOW",
              Version: "1.2.3",
              Status: "STARTED",
            },
          ]),
        ),
    };
    const provider = new RealRuntimeProvider(new RequestPipeline(stubResolver), httpClient);
    const artifacts = await provider.listArtifacts(context);
    assert.equal(artifacts[0]?.version, "1.2.3");
  });

  it("restartArtifact reads the artifact then redeploys with its Id/Version", async () => {
    const calls: HttpRequestOptions[] = [];
    let attempt = 0;
    const httpClient: IHttpClient = {
      execute: (options) => {
        calls.push(options);
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve(
            entityResponse({
              Id: "art1",
              Name: "Flow",
              Type: "INTEGRATION_FLOW",
              Version: "1.0.1",
              Status: "STARTED",
            }),
          );
        }
        return Promise.resolve(entityResponse({}));
      },
    };
    const provider = new RealRuntimeProvider(new RequestPipeline(stubResolver), httpClient);
    await provider.restartArtifact(context, "art1");
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.url.endsWith("/DeployIntegrationDesigntimeArtifact"));
    assert.equal(calls[1]?.query?.Id, "'art1'");
    assert.equal(calls[1]?.query?.Version, "'1.0.1'");
  });

  it("restartArtifact throws a typed not-found error when the artifact isn't deployed", async () => {
    const httpClient: IHttpClient = { execute: () => Promise.resolve(NOT_FOUND_RESPONSE) };
    const provider = new RealRuntimeProvider(new RequestPipeline(stubResolver), httpClient);
    await assert.rejects(
      () => provider.restartArtifact(context, "missing"),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "NOT_FOUND");
        return true;
      },
    );
  });
});

describe("sdk/providers/RealPayloadProvider", () => {
  it("getAttachment decodes a text content type (XML) as plain UTF-8 text", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.url.endsWith("/$value")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Map(),
            bodyBinary: new Uint8Array(Buffer.from("<Order/>", "utf8")),
            attempts: 1,
            durationMs: 1,
          });
        }
        return Promise.resolve(
          entityResponse({
            AttachmentId: "a1",
            Name: "payload.xml",
            ContentType: "application/xml",
            ContentLength: 8,
          }),
        );
      },
    };
    const provider = new RealPayloadProvider(new RequestPipeline(stubResolver), httpClient);
    const attachment = await provider.getAttachment(context, "m1", "a1");
    assert.equal(attachment?.content, "<Order/>");
    assert.equal(attachment?.name, "payload.xml");
  });

  it("getAttachment base64-encodes a genuinely binary content type", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.url.endsWith("/$value")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Map(),
            bodyBinary: new Uint8Array([104, 105]),
            attempts: 1,
            durationMs: 1,
          });
        }
        return Promise.resolve(
          entityResponse({
            AttachmentId: "a2",
            Name: "payload.bin",
            ContentType: "application/octet-stream",
            ContentLength: 2,
          }),
        );
      },
    };
    const provider = new RealPayloadProvider(new RequestPipeline(stubResolver), httpClient);
    const attachment = await provider.getAttachment(context, "m1", "a2");
    assert.equal(attachment?.content, Buffer.from([104, 105]).toString("base64"));
  });
});

describe("sdk/providers/RealCertificateProvider", () => {
  it("listExpiring filters and sorts by parsed ValidTo", async () => {
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve(
          collectionResponse([
            {
              Alias: "a",
              Type: "cert",
              ValidFrom: "/Date(1600000000000)/",
              ValidTo: `/Date(${Date.now() + 5 * 86400000})/`,
            },
            {
              Alias: "b",
              Type: "cert",
              ValidFrom: "/Date(1600000000000)/",
              ValidTo: `/Date(${Date.now() + 400 * 86400000})/`,
            },
          ]),
        ),
    };
    const provider = new RealCertificateProvider(new RequestPipeline(stubResolver), httpClient);
    const expiring = await provider.listExpiring(context, 30);
    assert.equal(expiring.length, 1);
    assert.equal(expiring[0]?.alias, "a");
  });
});

describe("sdk/providers/RealJmsProvider", () => {
  it("discoverQueues queries the Queues entity set and parses Int64-as-string runtime fields", async () => {
    let capturedUrl: string | undefined;
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        // OData v2 serializes Edm.Int64 as JSON strings — mirrors the live tenant exactly.
        return Promise.resolve(
          collectionResponse([
            { Name: "PIPQ1", NumbOfMsgs: "2", FillGrade: "15", Active: "1" },
            { Name: "DISCOVERED.OTHER", NumbOfMsgs: "0", FillGrade: "0", Active: "0" },
          ]),
        );
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    const discovered = await provider.discoverQueues(context);
    assert.equal(capturedUrl, `${tenant.baseUrl}/Queues`);
    assert.deepEqual(
      discovered.map((q) => q.queueName),
      ["PIPQ1", "DISCOVERED.OTHER"],
    );
    assert.equal(discovered[0]?.messageCount, 2);
    assert.equal(discovered[0]?.capacityUsedPct, 15);
    assert.equal(discovered[0]?.state, "STARTED");
    assert.equal(discovered[1]?.state, "STOPPED");
    // The Queues entity exposes no consumer count — reported unknown, never fabricated.
    assert.equal(discovered[0]?.consumerCount, undefined);
  });

  it("listMessages navigates MessagingQueues('q')/MessagingMessages with pageSize, never $filter/$top", async () => {
    let capturedUrl: string | undefined;
    let capturedQuery: HttpRequestOptions["query"];
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        capturedQuery = options.query;
        return Promise.resolve(
          collectionResponse([
            {
              jmsMessageId: "x-hex-1",
              queueName: "Q1",
              createdAt: "1771933250829",
              retryCount: "3",
            },
          ]),
        );
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    const page = await provider.listMessages(context, "Q1", { skip: 0, top: 10 });
    assert.equal(capturedUrl, `${tenant.baseUrl}/MessagingQueues('Q1')/MessagingMessages`);
    // This surface rejects OData system query options; paging uses its own pageSize (min 100).
    assert.equal(capturedQuery?.pageSize, "100");
    assert.equal(capturedQuery?.$filter, undefined);
    assert.equal(capturedQuery?.$top, undefined);
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.messageId, "x-hex-1");
    assert.equal(page.items[0]?.enqueuedAt, new Date(1771933250829).toISOString());
    assert.equal(page.items[0]?.retryCount, 3);
    // MessagingMessages exposes no size property — reported unknown, never fabricated.
    assert.equal(page.items[0]?.sizeBytes, undefined);
  });

  it("deleteMessage addresses the message by its composite key (jmsMessageId + queueName)", async () => {
    let capturedUrl: string | undefined;
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: new Map(),
          bodyText: JSON.stringify({ operation: "DELETE", processedCount: 1 }),
          attempts: 1,
          durationMs: 1,
        });
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    await provider.deleteMessage(context, "Q1", "x-hex-1");
    assert.equal(
      capturedUrl,
      `${tenant.baseUrl}/MessagingMessages(jmsMessageId='x-hex-1',queueName='Q1')`,
    );
  });

  it("purgeQueue deletes every message by composite key and returns the count removed", async () => {
    const deletions: string[] = [];
    let listCalls = 0;
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.method === "DELETE") {
          deletions.push(options.url);
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Map(),
            bodyText: JSON.stringify({ operation: "DELETE", processedCount: 1 }),
            attempts: 1,
            durationMs: 1,
          });
        }
        listCalls += 1;
        // First batch has two messages; the follow-up fetch shows the queue drained.
        return Promise.resolve(
          collectionResponse(
            listCalls === 1
              ? [
                  { jmsMessageId: "msg1", queueName: "Q1" },
                  { jmsMessageId: "msg2", queueName: "Q1" },
                ]
              : [],
          ),
        );
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    const purged = await provider.purgeQueue(context, "Q1");
    assert.equal(purged, 2);
    assert.deepEqual(deletions, [
      `${tenant.baseUrl}/MessagingMessages(jmsMessageId='msg1',queueName='Q1')`,
      `${tenant.baseUrl}/MessagingMessages(jmsMessageId='msg2',queueName='Q1')`,
    ]);
  });

  it("retryMessage POSTs the RetryMessagingMessages function import with a JSON body", async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    let capturedBody: unknown;
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        capturedMethod = options.method;
        capturedBody = options.body;
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: new Map(),
          bodyText: JSON.stringify({ operation: "RETRY", processedCount: 1 }),
          attempts: 1,
          durationMs: 1,
        });
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    await provider.retryMessage(context, "Q1", "x-hex-1");
    assert.equal(capturedUrl, `${tenant.baseUrl}/RetryMessagingMessages`);
    assert.equal(capturedMethod, "POST");
    assert.deepEqual(capturedBody, {
      encoding: "json",
      value: { queueName: "Q1", jmsMessageId: "x-hex-1" },
    });
  });

  it("getMessage reads the message by its composite key and returns undefined on 404", async () => {
    let capturedUrl: string | undefined;
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedUrl = options.url;
        return Promise.resolve(
          entityResponse({ jmsMessageId: "x-hex-1", queueName: "Q1", retryCount: "2" }),
        );
      },
    };
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), httpClient);
    const found = await provider.getMessage(context, "Q1", "x-hex-1");
    assert.equal(
      capturedUrl,
      `${tenant.baseUrl}/MessagingMessages(jmsMessageId='x-hex-1',queueName='Q1')`,
    );
    assert.equal(found?.messageId, "x-hex-1");
    assert.equal(found?.retryCount, 2);

    const notFoundHttpClient: IHttpClient = { execute: () => Promise.resolve(NOT_FOUND_RESPONSE) };
    const notFoundProvider = new RealJmsProvider(new RequestPipeline(stubResolver), notFoundHttpClient);
    assert.equal(await notFoundProvider.getMessage(context, "Q1", "missing"), undefined);
  });
});

describe("sdk/providers/RealValueMappingProvider", () => {
  it("getScheme returns metadata with an empty agencies list (documented limitation)", async () => {
    const httpClient: IHttpClient = {
      execute: () => Promise.resolve(entityResponse({ Name: "S1", Description: "desc" })),
    };
    const provider = new RealValueMappingProvider(new RequestPipeline(stubResolver), httpClient);
    const scheme = await provider.getScheme(context, "S1");
    assert.equal(scheme?.name, "S1");
    assert.deepEqual(scheme?.agencies, []);
  });
});

describe("sdk/providers/RealAlertProvider", () => {
  it("queryAlerts authenticates to ANS directly and maps its alert list", async () => {
    let capturedQuery: HttpRequestOptions["query"];
    const httpClient: IHttpClient = {
      execute: (options) => {
        capturedQuery = options.query;
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: new Map(),
          bodyText: JSON.stringify({
            alerts: [
              {
                id: "al1",
                severity: "ERROR",
                subject: "Something broke",
                eventTime: "2024-01-01T00:00:00.000Z",
              },
            ],
            totalHits: 1,
          }),
          attempts: 1,
          durationMs: 1,
        });
      },
    };
    const provider = new RealAlertProvider(httpClient, {
      baseUrl: "https://ans.example.test",
      authProvider: new BasicAuthProvider({ username: "u", password: "p" }),
    });
    const page = await provider.queryAlerts(context, { skip: 0, top: 10 }, "ERROR");
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.alertId, "al1");
    assert.equal(capturedQuery?.severity, "ERROR");
  });
});
