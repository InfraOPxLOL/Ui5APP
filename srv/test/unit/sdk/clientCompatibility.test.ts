import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockEngine } from "../../../src/sdk/mock/MockEngine.js";
import { MockMonitoringProvider } from "../../../src/sdk/providers/MockMonitoringProvider.js";
import { RealMonitoringProvider } from "../../../src/sdk/providers/RealMonitoringProvider.js";
import { MockCertificateProvider } from "../../../src/sdk/providers/MockCertificateProvider.js";
import { RealCertificateProvider } from "../../../src/sdk/providers/RealCertificateProvider.js";
import { MockValueMappingProvider } from "../../../src/sdk/providers/MockValueMappingProvider.js";
import { RealValueMappingProvider } from "../../../src/sdk/providers/RealValueMappingProvider.js";
import { RequestPipeline } from "../../../src/sdk/pipeline/RequestPipeline.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import type { IDestinationResolver } from "../../../src/sdk/destination/IDestinationResolver.js";
import type { TenantContext } from "../../../src/sdk/models/TenantContext.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpResponse } from "../../../src/sdk/http/HttpTypes.js";
import type { ProviderContext } from "../../../src/core/providers/types.js";

/**
 * Regression tests ensuring the mock and real implementations of each Phase-3 provider contract
 * stay behaviourally interchangeable (architecture: Testing, §13 — "Mock vs Real Provider
 * Compatibility Tests"): a module coded against `IMonitoringProvider` etc. must see the same shape
 * of domain object regardless of which composition-root mode is selected.
 */

const context: ProviderContext = { tenantId: "primary", correlationId: "corr-1" };
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

describe("mock vs real provider compatibility", () => {
  it("MessageProcessingLog: mock and real providers return the same key set", async () => {
    const mockProvider = new MockMonitoringProvider(
      new MockEngine({ enabled: true, defaultScenario: "success" }),
    );
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve(
          collectionResponse([
            { MessageGuid: "m1", Status: "FAILED", LogStart: "/Date(1700000000000)/" },
          ]),
        ),
    };
    const realProvider = new RealMonitoringProvider(new RequestPipeline(stubResolver), httpClient);

    const mockPage = await mockProvider.queryMessageLogs(context, {}, { skip: 0, top: 5 });
    const realPage = await realProvider.queryMessageLogs(context, {}, { skip: 0, top: 5 });

    assert.ok(mockPage.items.length > 0);
    assert.ok(realPage.items.length > 0);
    assert.deepEqual(
      Object.keys(mockPage.items[0]!).sort(),
      Object.keys(realPage.items[0]!).sort(),
    );
  });

  it("CertificateInfo: mock and real providers return the same key set", async () => {
    const mockProvider = new MockCertificateProvider(
      new MockEngine({ enabled: true, defaultScenario: "success" }),
    );
    const httpClient: IHttpClient = {
      execute: () =>
        Promise.resolve(
          collectionResponse([
            {
              Alias: "a",
              Type: "cert",
              ValidFrom: "/Date(1600000000000)/",
              ValidTo: "/Date(1700000000000)/",
            },
          ]),
        ),
    };
    const realProvider = new RealCertificateProvider(new RequestPipeline(stubResolver), httpClient);

    const [mockCert] = await mockProvider.listCertificates(context);
    const [realCert] = await realProvider.listCertificates(context);
    assert.deepEqual(Object.keys(mockCert!).sort(), Object.keys(realCert!).sort());
  });

  it("ValueMappingScheme: mock and real providers return objects with the same contract shape", async () => {
    const mockProvider = new MockValueMappingProvider(
      new MockEngine({ enabled: true, defaultScenario: "success" }),
    );
    const httpClient: IHttpClient = {
      execute: () => Promise.resolve(entityResponse({ Name: "S1", Description: "d" })),
    };
    const realProvider = new RealValueMappingProvider(
      new RequestPipeline(stubResolver),
      httpClient,
    );

    const [mockScheme] = await mockProvider.listSchemes(context);
    const realScheme = await realProvider.getScheme(context, "S1");
    assert.deepEqual(Object.keys(mockScheme!).sort(), Object.keys(realScheme!).sort());
  });
});

describe("IntegrationSuiteSdkClient providerMode selection", () => {
  it("defaults to mock mode when providerMode is unset (Phase 4 behaviour unchanged)", () => {
    const client = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    assert.equal(client.isMockModeEnabled(), true);
  });

  it("throws a typed configuration error when providerMode is real without dependencies", () => {
    assert.throws(
      () =>
        new IntegrationSuiteSdkClient({
          defaultTenantId: "primary",
          mockEngineConfig: { enabled: true, defaultScenario: "success" },
          providerMode: "real",
        }),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "CONFIGURATION_ERROR");
        return true;
      },
    );
  });

  it("wires every sub-client to real providers when providerMode is real, and reports non-mock mode", async () => {
    const httpClient: IHttpClient = {
      execute: () => Promise.resolve(collectionResponse([])),
    };
    const client = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
      providerMode: "real",
      real: { destinationResolver: stubResolver, httpClient },
    });
    assert.equal(client.isMockModeEnabled(), false);
    const page = await client.monitoring.queryMessageLogs({}, { skip: 0, top: 5 });
    assert.deepEqual(page.items, []);
  });
});
