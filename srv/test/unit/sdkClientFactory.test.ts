import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIntegrationSuiteSdkClient } from "../../src/config/sdkClientFactory.js";
import { configService } from "../../src/config/ConfigService.js";

/**
 * Exercises the composition-root factory against whatever `config/connectivity.json` actually ships
 * with — the same file `ConfigService` loads for the real process. `connectivity.json` is a live
 * operator-editable file (an operator switches `mode` to `"real"` once they have a tenant to point
 * at), so this test adapts to its current `mode` rather than assuming `"mock"`: real-mode wiring
 * (BTP discovery, static destinations, env-scoped secrets) is covered directly and in isolation in
 * `srv/test/unit/sdk/destination.test.ts` and `realProviders.test.ts`; this test only guards the one
 * seam those unit tests can't reach — that `createIntegrationSuiteSdkClient` reads
 * `ConfigService`/`env` correctly end to end for whichever mode is actually configured right now.
 */
describe("config/sdkClientFactory", () => {
  it("honours the shipped connectivity.json's mode", async () => {
    const connectivity = configService.getConnectivity();

    if (connectivity.mode === "mock") {
      const client = createIntegrationSuiteSdkClient({ enabled: true, defaultScenario: "success" });
      assert.equal(client.isMockModeEnabled(), true);
      const page = await client.monitoring.queryMessageLogs({}, { skip: 0, top: 5 });
      assert.ok(page.items.length > 0);
      return;
    }

    // mode is "real": either every required destination/credential is configured (in which case the
    // client builds successfully and reports non-mock mode), or something is missing and the
    // factory must fail fast with a typed ConfigurationError rather than silently falling back.
    try {
      const client = createIntegrationSuiteSdkClient({ enabled: true, defaultScenario: "success" });
      assert.equal(client.isMockModeEnabled(), false);
    } catch (error) {
      assert.equal((error as { code?: string }).code, "CONFIGURATION_ERROR");
    }
  });
});
