import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoeAdminService } from "../../../src/modules/coe-admin/service.js";
import { coeGlobalSettingsUpdateSchema } from "../../../src/modules/coe-admin/validators.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

/**
 * Builds a service whose engine factory reuses a single SDK client, so the stateful mock Partner
 * Directory store is shared across get/save calls (a fresh client per call would use a fresh store).
 */
function newService(): CoeAdminService {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  return new CoeAdminService(() => new OperationsEngine({ sdk, queueConfigs: [] }));
}

describe("modules/coe-admin/CoeAdminService", () => {
  it("reads the seeded global settings from .SYS_JMS_FRAMEWORK", async () => {
    const settings = await newService().getGlobalSettings();
    assert.equal(settings.environment, "DEV");
    assert.equal(settings.defaultRetries, 5);
    assert.equal(settings.defaultExceptionTo, "coe-support@middlewareops.com");
    assert.equal(settings.defaultEgressUri, "/ProcessDirect/CatchAll");
  });

  it("persists updated settings and reads them back", async () => {
    const service = newService();
    const saved = await service.saveGlobalSettings({
      environment: "QAS",
      defaultRetries: 8,
      defaultExceptionTo: "ops@example.com",
      defaultEgressUri: "/ProcessDirect/Fallback",
    });
    assert.equal(saved.environment, "QAS");
    assert.equal(saved.defaultRetries, 8);

    const reread = await service.getGlobalSettings();
    assert.equal(reread.environment, "QAS");
    assert.equal(reread.defaultRetries, 8);
    assert.equal(reread.defaultExceptionTo, "ops@example.com");
    assert.equal(reread.defaultEgressUri, "/ProcessDirect/Fallback");
  });
});

describe("modules/coe-admin/validators", () => {
  const valid = {
    environment: "DEV",
    defaultRetries: 5,
    defaultExceptionTo: "team@example.com",
    defaultEgressUri: "/ProcessDirect/CatchAll",
  };

  it("accepts a fully valid payload", () => {
    assert.doesNotThrow(() => coeGlobalSettingsUpdateSchema.parse(valid));
  });

  it("rejects an environment outside PRD/QAS/DEV", () => {
    assert.throws(() => coeGlobalSettingsUpdateSchema.parse({ ...valid, environment: "PROD" }));
  });

  it("rejects retries below 1 or above 10", () => {
    assert.throws(() => coeGlobalSettingsUpdateSchema.parse({ ...valid, defaultRetries: 0 }));
    assert.throws(() => coeGlobalSettingsUpdateSchema.parse({ ...valid, defaultRetries: 11 }));
  });

  it("rejects a malformed email", () => {
    assert.throws(() =>
      coeGlobalSettingsUpdateSchema.parse({ ...valid, defaultExceptionTo: "nope" }),
    );
  });

  it("rejects an egress path not starting with a slash", () => {
    assert.throws(() =>
      coeGlobalSettingsUpdateSchema.parse({ ...valid, defaultEgressUri: "ProcessDirect" }),
    );
  });
});
