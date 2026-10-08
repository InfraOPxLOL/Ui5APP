import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RequestPipeline } from "../../../src/sdk/pipeline/RequestPipeline.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import { RealB2bMonitoringProvider } from "../../../src/sdk/providers/RealB2bMonitoringProvider.js";
import { RealMonitoringProvider } from "../../../src/sdk/providers/RealMonitoringProvider.js";
import { RealJmsProvider } from "../../../src/sdk/providers/RealJmsProvider.js";
import type { ProviderContext } from "../../../src/core/providers/types.js";

const context: ProviderContext = { tenantId: "primary", correlationId: "corr-1" };
const BASE = "https://cpi.example.test/api/v1";

const tenant: TenantContext = {
  tenantId: "primary",
  baseUrl: BASE,
  headers: { Authorization: "Bearer tok" },
  destinationName: "D1",
};

const stubResolver: IDestinationResolver = {
  resolve: () => Promise.resolve(tenant),
  listEnvironments: () => Promise.resolve(["development"]),
};

function ok(body: unknown): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify({ d: body }),
    attempts: 1,
    durationMs: 1,
  };
}

const NOT_FOUND: HttpResponse = {
  status: 404,
  ok: false,
  headers: new Map(),
  attempts: 1,
  durationMs: 1,
};

const RAW_DOCUMENT = {
  Id: "40f83297bb48e5953b421d860b04dac1",
  OverallStatus: "FAILED",
  StartedAt: "/Date(1700000000000)/",
  EndedAt: "/Date(1700000004200)/",
  InterchangeDirection: "INBOUND",
  RetryAllowed: true,
  SenderTradingPartnerName: "AMAZONJP (Hills)",
  SenderDocumentStandard: "ASC-X12",
  SenderMessageType: "850",
  SenderInterchangeControlNumber: "000010812",
  ReceiverTradingPartnerName: "",
};

/** Records every request and answers from a route table keyed by URL suffix. */
function recordingClient(routes: (options: HttpRequestOptions) => HttpResponse): {
  readonly client: IHttpClient;
  readonly requests: HttpRequestOptions[];
} {
  const requests: HttpRequestOptions[] = [];
  return {
    requests,
    client: {
      execute: (options) => {
        requests.push(options);
        return Promise.resolve(routes(options));
      },
    },
  };
}

function provider(client: IHttpClient): RealB2bMonitoringProvider {
  return new RealB2bMonitoringProvider(new RequestPipeline(stubResolver), client);
}

describe("sdk/providers/RealB2bMonitoringProvider", () => {
  it("queryInterchanges sends server-side v2 filters, newest first, with an inline count", async () => {
    const { client, requests } = recordingClient(() => ({
      ...ok({ results: [RAW_DOCUMENT], __count: "1" }),
    }));
    const page = await provider(client).queryInterchanges(
      context,
      { overallStatus: "FAILED", senderPartner: "AMAZON", controlNumber: "10812" },
      { skip: 0, top: 25 },
    );

    const request = requests[0];
    assert.equal(request?.url, `${BASE}/BusinessDocuments`);
    assert.equal(request?.query?.$top, 25);
    assert.equal(request?.query?.$orderby, "StartedAt desc");
    assert.equal(request?.query?.$inlinecount, "allpages");
    const filter = String(request?.query?.$filter);
    assert.ok(filter.includes("OverallStatus eq 'FAILED'"), filter);
    assert.ok(filter.includes("substringof('AMAZON',SenderTradingPartnerName)"), filter);
    assert.ok(filter.includes("substringof('10812',SenderInterchangeControlNumber)"), filter);
    assert.ok(!filter.includes("contains("), "v2 must never send contains()");

    assert.equal(page.total, 1);
    const row = page.items[0];
    assert.equal(row?.id, RAW_DOCUMENT.Id);
    assert.equal(row?.startedAt, new Date(1700000000000).toISOString());
    assert.equal(row?.sender.tradingPartnerName, "AMAZONJP (Hills)");
    assert.equal(row?.sender.interchangeControlNumber, "000010812");
    assert.equal(row?.receiver.tradingPartnerName, undefined, "empty strings read as absent");
    assert.equal(row?.retryAllowed, true);
  });

  it("getInterchange reads the document, then events, payloads and errors as navigations", async () => {
    const docUrl = `${BASE}/BusinessDocuments('${RAW_DOCUMENT.Id}')`;
    const { client, requests } = recordingClient((options) => {
      if (options.url === docUrl) {
        return ok(RAW_DOCUMENT);
      }
      if (options.url === `${docUrl}/BusinessDocumentProcessingEvents`) {
        return ok({
          results: [
            {
              Id: "e2",
              EventType: "FAILED",
              Date: "/Date(1700000004200)/",
              MonitoringType: "MPL",
              MonitoringId: "mpl-1",
            },
            {
              Id: "e1",
              EventType: "RECEIVED",
              Date: "/Date(1700000000000)/",
              MonitoringType: "MPL",
              MonitoringId: "mpl-1",
            },
          ],
        });
      }
      if (options.url === `${docUrl}/BusinessDocumentPayloads`) {
        return ok({
          results: [{ Id: "p1", Direction: "INBOUND", PayloadContentType: "application/edi-x12" }],
        });
      }
      if (options.url === `${docUrl}/LastErrorDetails`) {
        // A single-entity navigation, not a collection.
        return ok({
          Id: "err1",
          ErrorInformation: "Mapping failure",
          ErrorCategory: "Processing",
          IsTransientError: false,
        });
      }
      return NOT_FOUND;
    });

    const detail = await provider(client).getInterchange(context, RAW_DOCUMENT.Id);
    assert.equal(requests.length, 4);
    assert.deepEqual(
      detail?.events.map((event) => event.eventType),
      ["RECEIVED", "FAILED"],
      "events are ordered oldest first",
    );
    assert.equal(detail?.payloads[0]?.id, "p1");
    assert.equal(detail?.errors.length, 1);
    assert.equal(detail?.errors[0]?.errorInformation, "Mapping failure");
  });

  it("getInterchange reads an absent navigation as empty and an unknown document as undefined", async () => {
    const docUrl = `${BASE}/BusinessDocuments('known')`;
    const { client } = recordingClient((options) =>
      options.url === docUrl ? ok({ ...RAW_DOCUMENT, Id: "known" }) : NOT_FOUND,
    );
    const detail = await provider(client).getInterchange(context, "known");
    assert.deepEqual(detail?.events, []);
    assert.deepEqual(detail?.payloads, []);
    assert.deepEqual(detail?.errors, []);
    assert.equal(await provider(client).getInterchange(context, "unknown"), undefined);
  });

  it("getPayload streams $value and decodes EDI as text", async () => {
    const edi = "ISA*00*~ST*850*0001~";
    const { client, requests } = recordingClient((options) => {
      if (options.url.endsWith("/$value")) {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          bodyBinary: new Uint8Array(Buffer.from(edi, "utf8")),
          attempts: 1,
          durationMs: 1,
        };
      }
      return ok({ Id: "p1", Direction: "INBOUND", PayloadContentType: "application/edi-x12" });
    });
    const payload = await provider(client).getPayload(context, "p1");
    assert.equal(requests[1]?.url, `${BASE}/BusinessDocumentPayloads('p1')/$value`);
    assert.equal(payload?.encoding, "text");
    assert.equal(payload?.content, edi);
  });

  it("findInterchangeByMplId filters processing events on MonitoringId, then follows the document navigation", async () => {
    const { client, requests } = recordingClient((options) => {
      if (options.url === `${BASE}/BusinessDocumentProcessingEvents`) {
        return ok({ results: [{ Id: "evt-9", MonitoringId: "mpl-77" }] });
      }
      if (options.url === `${BASE}/BusinessDocumentProcessingEvents('evt-9')/BusinessDocument`) {
        return ok(RAW_DOCUMENT);
      }
      return NOT_FOUND;
    });
    const interchange = await provider(client).findInterchangeByMplId(context, "mpl-77");
    assert.equal(requests[0]?.query?.$filter, "MonitoringId eq 'mpl-77'");
    assert.equal(interchange?.id, RAW_DOCUMENT.Id);
  });

  it("findInterchangeByMplId returns undefined when no event references the MPL", async () => {
    const { client } = recordingClient(() => ok({ results: [] }));
    assert.equal(await provider(client).findInterchangeByMplId(context, "nope"), undefined);
  });
});

describe("sdk/providers/RealMonitoringProvider correlation lookup", () => {
  it("filters MessageProcessingLogs server-side on CorrelationId", async () => {
    const { client, requests } = recordingClient(() => ok({ results: [], __count: "0" }));
    await new RealMonitoringProvider(new RequestPipeline(stubResolver), client).queryMessageLogs(
      context,
      { correlationId: "corr-abc" },
      { skip: 0, top: 200 },
    );
    assert.equal(requests[0]?.query?.$filter, "CorrelationId eq 'corr-abc'");
  });
});

describe("sdk/providers/RealJmsProvider message fields", () => {
  it("maps mplId, correlationId and identity fields, treating a zero epoch as absent", async () => {
    const { client } = recordingClient((options) => {
      if (options.url.includes("/MessagingMessages")) {
        return ok({
          results: [
            {
              jmsMessageId: "jms-1",
              queueName: "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
              failed: true,
              mplId: "mpl-1",
              correlationId: "corr-1",
              createdAt: "1700000000000",
              retryCount: "3",
              nextRetry: "0",
              sender: "AMAZONJP",
              messageType: "850",
            },
          ],
        });
      }
      return ok({ numberOfMessages: "1" });
    });
    const page = await new RealJmsProvider(new RequestPipeline(stubResolver), client).listMessages(
      context,
      "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
      { skip: 0, top: 50 },
    );
    const message = page.items[0];
    assert.equal(message?.mplId, "mpl-1");
    assert.equal(message?.correlationId, "corr-1");
    assert.equal(message?.failed, true);
    assert.equal(message?.retryCount, 3);
    assert.equal(message?.sender, "AMAZONJP");
    assert.equal(message?.nextRetryAt, undefined);
  });
});
