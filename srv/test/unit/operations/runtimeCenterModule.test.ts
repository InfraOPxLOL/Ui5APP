import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuntimeCenterService } from "../../../src/modules/runtime-center/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

function newService(): RuntimeCenterService {
  return new RuntimeCenterService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: [] });
  });
}

describe("modules/runtime-center/RuntimeCenterService", () => {
  it("listCatalog returns an array of enriched catalog entries", async () => {
    const catalog = await newService().listCatalog();
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length > 0);
    assert.equal(typeof catalog[0]?.version, "string");
  });

  it("getDetails/getHealth/getDeploymentTimeline compose coherently for a real mock-mode artifact", async () => {
    const service = newService();
    const catalog = await service.listCatalog();
    const artifactId = catalog[0]?.artifactId;
    assert.ok(artifactId !== undefined);

    const details = await service.getDetails(artifactId);
    assert.equal(details?.artifactId, artifactId);
    assert.ok(Array.isArray(details?.relatedQueues));
    assert.deepEqual(details?.dependencies, []);

    const health = await service.getHealth(artifactId);
    assert.equal(health?.artifactId, artifactId);
    assert.ok(["increasing", "stable", "decreasing"].includes(health!.failureTrend));

    const timeline = await service.getDeploymentTimeline(artifactId);
    assert.ok((timeline?.length ?? 0) >= 1);
  });

  // Note: MockRuntimeProvider.getArtifact deliberately falls back to the first generated artifact
  // for any unrecognized id (mirrors MockPayloadProvider.getAttachment's own documented mock
  // leniency), so "unknown artifact id" is not a distinct, testable scenario in mock mode here —
  // that fallback is real-provider-observable-only behavior. The engine-level "unknown id returns
  // undefined" path is covered directly in runtimeCenterEngine.test.ts against a custom provider
  // fixture that does not fall back.

  it("redeploy appends a redeployed event for a real mock-mode artifact", async () => {
    const service = newService();
    const catalog = await service.listCatalog();
    const artifactId = catalog[0]?.artifactId;
    assert.ok(artifactId !== undefined);

    const event = await service.redeploy(artifactId, "alice");
    assert.equal(event?.kind, "redeployed");
    assert.equal(event?.actor, "alice");

    const timeline = await service.getDeploymentTimeline(artifactId);
    assert.ok(timeline?.some((e) => e.kind === "redeployed"));
  });
});
