import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoeRuleBuilderService } from "../../../src/modules/coe-rule-builder/service.js";
import { ruleSaveSchema } from "../../../src/modules/coe-rule-builder/validators.js";
import type { Rule } from "../../../src/modules/coe-rule-builder/dto.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

/** Shares one SDK client across the engine factory so the stateful mock PD store persists across calls. */
function newService(): CoeRuleBuilderService {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  return new CoeRuleBuilderService(() => new OperationsEngine({ sdk, queueConfigs: [] }));
}

const rulesetRule: Rule = {
  kind: "ruleset",
  ruleName: "Rule1",
  identifyingQueries: [{ type: "property", expression: "MESTYP", expectedValue: "ORDERS" }],
  targetRouting: { targetPid: "PID_TARGET", routeKey: ".ORDERS05.ORDERS.*.SND.*.RCV" },
};

const xCastRule: Rule = {
  kind: "xcast",
  root: {
    nodeType: "condition",
    conditionType: "if",
    condition: { filterType: "property", expression: "Region", expectedValue: "NA" },
    then: { nodeType: "output", routingType: "JMS", target: "Common_JMS_ID_NA_P1" },
    next: {
      nodeType: "else",
      then: { nodeType: "output", routingType: "Terminate", target: "" },
    },
  },
};

describe("modules/coe-rule-builder/CoeRuleBuilderService", () => {
  it("round-trips a ruleset rule (JSON encode/decode at the base64 boundary)", async () => {
    const service = newService();
    const saved = await service.saveRule("PID_RULES", "Rule1", rulesetRule);
    assert.deepEqual(saved, rulesetRule);
    const reread = await service.getRule("PID_RULES", "Rule1");
    assert.deepEqual(reread, rulesetRule);
  });

  it("round-trips a nested x-cast rule (if/elseIf/else chain)", async () => {
    const service = newService();
    await service.saveRule("PID_RULES", "XCast1", xCastRule);
    const reread = await service.getRule("PID_RULES", "XCast1");
    assert.deepEqual(reread, xCastRule);
  });

  it("throws 404 for a rule that does not exist", async () => {
    const service = newService();
    await assert.rejects(() => service.getRule("PID_RULES", "NoSuchRule"));
  });

  it("lists rules under a PID with their decoded kind", async () => {
    const service = newService();
    await service.saveRule("PID_RULES", "Rule1", rulesetRule);
    await service.saveRule("PID_RULES", "XCast1", xCastRule);
    const list = await service.listRules("PID_RULES");
    assert.equal(list.rules.length, 2);
    const kinds = list.rules.map((r) => r.kind).sort();
    assert.deepEqual(kinds, ["ruleset", "xcast"]);
  });

  it("deletes a rule", async () => {
    const service = newService();
    await service.saveRule("PID_RULES", "Rule1", rulesetRule);
    await service.deleteRule("PID_RULES", "Rule1");
    await assert.rejects(() => service.getRule("PID_RULES", "Rule1"));
  });
});

describe("modules/coe-rule-builder/validators", () => {
  it("accepts a valid ruleset rule save payload", () => {
    assert.doesNotThrow(() =>
      ruleSaveSchema.parse({ pid: "PID_RULES", id: "Rule1", rule: rulesetRule }),
    );
  });

  it("accepts a valid nested x-cast rule save payload", () => {
    assert.doesNotThrow(() =>
      ruleSaveSchema.parse({ pid: "PID_RULES", id: "XCast1", rule: xCastRule }),
    );
  });

  it("rejects a ruleset rule with no identifying queries", () => {
    assert.throws(() =>
      ruleSaveSchema.parse({
        pid: "PID_RULES",
        id: "Rule1",
        rule: { ...rulesetRule, identifyingQueries: [] },
      }),
    );
  });

  it("rejects an x-cast root that isn't an 'if' condition", () => {
    assert.throws(() =>
      ruleSaveSchema.parse({
        pid: "PID_RULES",
        id: "XCast1",
        rule: {
          kind: "xcast",
          root: {
            nodeType: "condition",
            conditionType: "elseIf",
            condition: { filterType: "property", expression: "Region", expectedValue: "NA" },
            then: { nodeType: "output", routingType: "JMS", target: "Common_JMS_ID_NA_P1" },
          },
        },
      }),
    );
  });

  it("rejects a bad PID", () => {
    assert.throws(() => ruleSaveSchema.parse({ pid: "bad pid!", id: "Rule1", rule: rulesetRule }));
  });
});
