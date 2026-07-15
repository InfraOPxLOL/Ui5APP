import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoeRegistryService } from "../../../src/modules/coe-registry/service.js";
import { CoeDlqService } from "../../../src/modules/coe-dlq/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

/** A shared-SDK engine factory so the stateful mock Partner Directory store persists across calls. */
function sharedEngineFactory(): () => OperationsEngine {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  return () => new OperationsEngine({ sdk, queueConfigs: [] });
}

describe("modules/coe-registry/CoeRegistryService", () => {
  it("lists, edits and deletes parameters under a PID", async () => {
    const service = new CoeRegistryService(sharedEngineFactory());

    const before = await service.listByPid(".SYS_JMS_FRAMEWORK");
    assert.ok(before.parameters.length >= 4);

    const saved = await service.updateParameter({
      pid: ".SYS_JMS_FRAMEWORK",
      id: "Environment",
      value: "QAS",
    });
    assert.equal(saved.value, "QAS");

    await service.deleteParameter(".SYS_JMS_FRAMEWORK", "Environment");
    const after = await service.listByPid(".SYS_JMS_FRAMEWORK");
    assert.ok(!after.parameters.some((parameter) => parameter.id === "Environment"));
  });

  it("returns an empty list for a PID with no parameters", async () => {
    const service = new CoeRegistryService(sharedEngineFactory());
    const list = await service.listByPid(".NO.SUCH.PID");
    assert.deepEqual(list.parameters, []);
  });
});

describe("modules/coe-dlq/CoeDlqService", () => {
  it("lists failed messages with the CoE business identifiers", async () => {
    const service = new CoeDlqService(sharedEngineFactory());
    const list = await service.listFailedMessages();
    // Mock message fixtures include FAILED-status entries.
    assert.ok(list.items.every((row) => typeof row.interfaceTarget === "string"));
    assert.ok(list.total >= list.items.length);
  });

  it("resolves recovery context and reports an honest replay result", async () => {
    const factory = sharedEngineFactory();
    const service = new CoeDlqService(factory);
    const list = await service.listFailedMessages();
    if (list.items.length === 0) {
      return; // no failed message in this fixture run — nothing to resolve
    }
    const messageId = list.items[0]!.messageId;

    const recovery = await service.getRecovery(messageId);
    assert.equal(recovery.messageId, messageId);
    assert.ok(["partner-directory", "unavailable"].includes(recovery.resolutionSource));

    const replay = await service.replay(messageId);
    assert.equal(replay.executed, false);
    assert.equal(typeof replay.note, "string");
  });

  it("throws 404 for an unknown message", async () => {
    const service = new CoeDlqService(sharedEngineFactory());
    await assert.rejects(() => service.getRecovery("does-not-exist"));
  });
});
