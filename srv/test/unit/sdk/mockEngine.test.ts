import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockEngine } from "../../../src/sdk/mock/MockEngine.js";
import { TimeoutError } from "../../../src/sdk/errors/TimeoutError.js";
import { NetworkError } from "../../../src/sdk/errors/NetworkError.js";
import { IntegrationSuiteError } from "../../../src/core/errors/IntegrationSuiteError.js";

function operation(overrides: Partial<Parameters<MockEngine["resolve"]>[0]> = {}) {
  return {
    operationKey: "test.operation",
    tenantId: "primary",
    generateSuccess: () => ["a", "b"],
    generateEmpty: () => [],
    generateLarge: () => Array.from({ length: 100 }, (_, i) => `item-${i}`),
    ...overrides,
  };
}

describe("sdk/mock/MockEngine", () => {
  it("success scenario returns the success generator's result", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "success" });
    const result = await engine.resolve(operation());
    assert.deepEqual(result, ["a", "b"]);
  });

  it("empty scenario returns the empty generator's result", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "empty" });
    const result = await engine.resolve(operation());
    assert.deepEqual(result, []);
  });

  it("largePayload scenario returns the large generator's result", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "largePayload" });
    const result = await engine.resolve(operation());
    assert.equal(result.length, 100);
  });

  it("slow scenario delays before returning the success result", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "slow", slowDelayMs: 20 });
    const start = Date.now();
    const result = await engine.resolve(operation());
    assert.ok(Date.now() - start >= 20);
    assert.deepEqual(result, ["a", "b"]);
  });

  it("timeout scenario throws TimeoutError", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "timeout" });
    await assert.rejects(() => engine.resolve(operation()), TimeoutError);
  });

  it("error scenario throws IntegrationSuiteError", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "error" });
    await assert.rejects(() => engine.resolve(operation()), IntegrationSuiteError);
  });

  it("failure scenario throws NetworkError", async () => {
    const engine = new MockEngine({ enabled: true, defaultScenario: "failure" });
    await assert.rejects(() => engine.resolve(operation()), NetworkError);
  });

  it("per-operation scenario override takes precedence over the default", async () => {
    const engine = new MockEngine({
      enabled: true,
      defaultScenario: "success",
      scenarioOverrides: { "test.operation": "empty" },
    });
    const result = await engine.resolve(operation());
    assert.deepEqual(result, []);
  });

  it("isEnabled reflects the configured enabled flag", () => {
    assert.equal(new MockEngine({ enabled: true, defaultScenario: "success" }).isEnabled(), true);
    assert.equal(new MockEngine({ enabled: false, defaultScenario: "success" }).isEnabled(), false);
  });
});
