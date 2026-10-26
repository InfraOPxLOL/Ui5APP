import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RequestPipeline } from "../../../src/sdk/pipeline/RequestPipeline.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import { RealMonitoringProvider } from "../../../src/sdk/providers/RealMonitoringProvider.js";
import { RealJmsProvider } from "../../../src/sdk/providers/RealJmsProvider.js";
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

function recording(body: unknown): { client: IHttpClient; requests: HttpRequestOptions[] } {
  const requests: HttpRequestOptions[] = [];
  const response: HttpResponse = {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify(body),
    attempts: 1,
    durationMs: 1,
  };
  return {
    requests,
    client: {
      execute: (options) => {
        requests.push(options);
        return Promise.resolve(response);
      },
    },
  };
}

describe("sdk/providers non-B2B request shapes", () => {
  it("reads several transactions' chains in one MPL query by ORing their correlation ids", async () => {
    const { client, requests } = recording({ d: { results: [], __count: "0" } });
    const provider = new RealMonitoringProvider(new RequestPipeline(stubResolver), client);
    await provider.queryMessageLogs(
      context,
      { correlationIds: ["c1", "c2"], sender: "S4", applicationId: "4711" },
      { skip: 0, top: 50 },
    );
    const filter = String(requests[0]?.query?.$filter);
    assert.ok(filter.includes("(CorrelationId eq 'c1') or (CorrelationId eq 'c2')"), filter);
    assert.ok(filter.includes("substringof('S4',Sender)"), filter);
    assert.ok(filter.includes("ApplicationMessageId eq '4711'"), filter);
  });

  it("finds a queue's messages through the JMS API's own correlationId parameter", async () => {
    const { client, requests } = recording({
      d: {
        results: [{ jmsMessageId: "ID:1", queueName: "Common_JMS_ID_DLQ", correlationId: "c1" }],
      },
    });
    const provider = new RealJmsProvider(new RequestPipeline(stubResolver), client);
    const found = await provider.findMessages(context, "Common_JMS_ID_DLQ", {
      correlationId: "c1",
    });

    assert.equal(
      requests[0]?.url,
      `${tenant.baseUrl}/MessagingQueues('Common_JMS_ID_DLQ')/MessagingMessages`,
    );
    assert.equal(requests[0]?.query?.correlationId, "c1");
    assert.equal(requests[0]?.query?.$filter, undefined, "this surface rejects $filter with 400");
    assert.equal(found[0]?.messageId, "ID:1");
    assert.equal(found[0]?.correlationId, "c1");
  });
});
