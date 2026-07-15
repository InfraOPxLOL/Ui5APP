import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpResponse } from "../../../src/sdk/http/HttpTypes.js";

const tenant: TenantContext = {
  tenantId: "primary",
  baseUrl: "https://cpi.example.test/api/v1",
  headers: {},
  destinationName: "D1",
};
const stubResolver: IDestinationResolver = {
  resolve: () => Promise.resolve(tenant),
  listEnvironments: () => Promise.resolve(["development"]),
};

function collectionResponse(results: readonly unknown[]): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify({ d: { results, __count: String(results.length) } }),
    attempts: 1,
    durationMs: 1,
  };
}

describe("operations/OperationsEngine (mock mode)", () => {
  function newEngine(): OperationsEngine {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: [] });
  }

  it("exposes every documented engine", () => {
    const engine = newEngine();
    assert.ok(engine.message);
    assert.ok(engine.runtime);
    assert.ok(engine.payload);
    assert.ok(engine.header);
    assert.ok(engine.attachment);
    assert.ok(engine.queue);
    assert.ok(engine.certificate);
    assert.ok(engine.statistics);
    assert.ok(engine.search);
    assert.ok(engine.filter);
    assert.ok(engine.export);
    assert.ok(engine.refresh);
    assert.ok(engine.notification);
  });

  it("message.queryMessages returns enriched MessageSummary DTOs, not SDK objects", async () => {
    const engine = newEngine();
    const result = await engine.message.queryMessages({
      page: 1,
      pageSize: 5,
      sortDirection: "desc",
      includePayload: false,
      includeAttachments: false,
      includeHeaders: false,
    });
    assert.ok(result.items.length > 0);
    assert.ok("humanReadableStatus" in result.items[0]!);
    assert.ok("severity" in result.items[0]!);
  });

  it("getDashboardSummary composes statistics, runtime health and notifications", async () => {
    const engine = newEngine();
    const dashboard = await engine.getDashboardSummary(
      "1970-01-01T00:00:00.000Z",
      new Date().toISOString(),
    );
    assert.ok(dashboard.statistics.totalMessages >= 0);
    const totalHealth =
      dashboard.runtimeHealthCounts.healthy +
      dashboard.runtimeHealthCounts.warning +
      dashboard.runtimeHealthCounts.critical;
    assert.ok(totalHealth > 0);
    assert.ok(Array.isArray(dashboard.recentNotifications));
  });
});

describe("operations/OperationsEngine mock vs real compatibility", () => {
  it("message.queryMessages returns the same MessageSummary key set from either provider mode", async () => {
    const mockSdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    const mockEngine = new OperationsEngine({ sdk: mockSdk, queueConfigs: [] });

    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve(
          collectionResponse([
            { MessageGuid: "m1", Status: "FAILED", LogStart: "/Date(1700000000000)/" },
          ]),
        ),
    };
    const realSdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
      providerMode: "real",
      real: { destinationResolver: stubResolver, httpClient },
    });
    const realEngine = new OperationsEngine({ sdk: realSdk, queueConfigs: [] });

    const query = {
      page: 1,
      pageSize: 5,
      sortDirection: "desc" as const,
      includePayload: false,
      includeAttachments: false,
      includeHeaders: false,
    };
    const mockResult = await mockEngine.message.queryMessages(query);
    const realResult = await realEngine.message.queryMessages(query);

    assert.ok(mockResult.items.length > 0);
    assert.ok(realResult.items.length > 0);
    assert.deepEqual(
      Object.keys(mockResult.items[0]!).sort(),
      Object.keys(realResult.items[0]!).sort(),
    );
  });
});
