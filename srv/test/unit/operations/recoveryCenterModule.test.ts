import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RecoveryCenterService } from "../../../src/modules/recovery-center/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";

const queueConfigs: QueueConfig[] = [
  {
    name: "ORDERS.IN",
    displayName: "Orders Inbound",
    description: "",
    deadLetterQueue: "ORDERS.DLQ",
    retryQueue: "ORDERS.RETRY",
    priority: 1,
    enabled: true,
    retryStrategy: "manual",
    maxRetries: 0,
  },
];

function newService(): RecoveryCenterService {
  return new RecoveryCenterService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs });
  });
}

describe("modules/recovery-center/RecoveryCenterService", () => {
  it("getDashboard composes candidates, queue health, DLQ overview and statistics in one call", async () => {
    const dashboard = await newService().getDashboard();
    assert.ok(Array.isArray(dashboard.candidates));
    assert.ok(Array.isArray(dashboard.queueHealth));
    assert.ok(Array.isArray(dashboard.dlqOverview));
    assert.equal(typeof dashboard.statistics.totalRecoveries, "number");
    assert.ok(Array.isArray(dashboard.recentRecoveries));
  });

  it("preview resolves the destination queue via config/queues.json's dead-letter mapping", async () => {
    const preview = await newService().preview("ORDERS.DLQ", true);
    assert.equal(preview.sourceQueue, "ORDERS.DLQ");
    assert.equal(preview.destinationQueue, "ORDERS.IN");
    assert.equal(preview.confirmationRequired, true);
  });

  it("recover + getHistory compose coherently: a dry run appears in history with dryRun true", async () => {
    const service = newService();
    const result = await service.recover("ORDERS.DLQ", { dryRun: true }, "alice", true);
    assert.equal(result.dryRun, true);
    assert.equal(result.sourceQueue, "ORDERS.DLQ");

    const history = service.getHistory(0, 10);
    const recorded = history.items.find((entry) => entry.recoveryId === result.recoveryId);
    assert.ok(recorded !== undefined);
    assert.equal(recorded?.dryRun, true);
    assert.equal(recorded?.operator, "alice");
  });

  it("cancel/retry return undefined for unknown recovery ids", async () => {
    const service = newService();
    assert.equal(service.cancel("does-not-exist"), undefined);
    assert.equal(await service.retry("does-not-exist", true), undefined);
  });

  it("validate reports the userPermission check honestly from the caller's scope", async () => {
    const service = newService();
    const withoutScope = await service.validate("ORDERS.DLQ", false);
    const withScope = await service.validate("ORDERS.DLQ", true);
    assert.equal(withoutScope.checks.find((c) => c.key === "userPermission")?.passed, false);
    assert.equal(withScope.checks.find((c) => c.key === "userPermission")?.passed, true);
  });
});
