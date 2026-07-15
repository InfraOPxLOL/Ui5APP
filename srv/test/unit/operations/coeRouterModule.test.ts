import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CoeRouterService,
  buildRouteKey,
  toStorageKey,
} from "../../../src/modules/coe-router/service.js";
import {
  combinedDeploySchema,
  routeDeploySchema,
  routerDeploySchema,
} from "../../../src/modules/coe-router/validators.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

/** Shares one SDK client across the engine factory so the stateful mock PD store persists across calls. */
function newService(): CoeRouterService {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  return new CoeRouterService(() => new OperationsEngine({ sdk, queueConfigs: [] }));
}

/** Same as {@link newService}, but also exposes the shared engine so a test can write fixtures directly. */
function newServiceWithEngine(): { service: CoeRouterService; engine: OperationsEngine } {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  const engine = new OperationsEngine({ sdk, queueConfigs: [] });
  return { service: new CoeRouterService(() => engine), engine };
}

const idoc = {
  sndprn: "SHOPIFY",
  rcvprn: "S4HANA",
  mestyp: "ORDERS",
  idoctyp: "ORDERS05",
  sndpor: "SAP_S4H",
  rcvpor: "SAP_TGT",
};

describe("modules/coe-router/buildRouteKey", () => {
  it("builds the 6-part key .IDOCTYP.MESTYP.SNDPOR.SNDPRN.RCVPOR.RCVPRN", () => {
    assert.equal(buildRouteKey(idoc), ".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA");
  });

  it("substitutes * for absent identifiers", () => {
    assert.equal(
      buildRouteKey({ ...idoc, sndpor: "", rcvpor: "" }),
      ".ORDERS05.ORDERS.*.SHOPIFY.*.S4HANA",
    );
  });

  it("toStorageKey replaces the display * with the CPI-legal ~", () => {
    assert.equal(
      toStorageKey(".ORDERS05.ORDERS.*.SHOPIFY.*.S4HANA"),
      ".ORDERS05.ORDERS.~.SHOPIFY.~.S4HANA",
    );
  });
});

describe("modules/coe-router/CoeRouterService.checkAgreement", () => {
  it("returns the normal track when no agreement exists for the sender/receiver pair", async () => {
    const check = await newService().checkAgreement({
      sndprn: "NEWSENDER",
      rcvprn: "NEWRECEIVER",
      mestyp: "ORDERS",
      targetPid: "PID_SALESFORCE_CORE",
    });
    assert.equal(check.track, "normal");
    assert.equal(check.agreementExists, false);
    assert.equal(check.agreementStorePid, "_Maintain_JMS_Agreements");
    assert.equal(check.agreementKey, ".NEWSENDER.NEWRECEIVER");
    assert.equal(check.rulesetKey, undefined);
  });

  it("returns the ruleset track when an agreement points at a different target partner", async () => {
    // The mock store seeds `_Maintain_JMS_Agreements` param `.SHOPIFY.S4HANA` = PID_EXISTING_OWNER.
    const check = await newService().checkAgreement({
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
      mestyp: "ORDERS",
      targetPid: "PID_SALESFORCE_CORE",
    });
    assert.equal(check.track, "ruleset");
    assert.equal(check.agreementExists, true);
    assert.equal(check.existingTargetPid, "PID_EXISTING_OWNER");
    assert.equal(check.rulesetKey, "RULESET_.SHOPIFY.S4HANA");
  });

  it("returns normal (reuse) when the existing agreement already points at the same target", async () => {
    const check = await newService().checkAgreement({
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
      mestyp: "ORDERS",
      targetPid: "PID_EXISTING_OWNER",
    });
    assert.equal(check.track, "normal");
    assert.equal(check.agreementExists, true);
  });
});

describe("modules/coe-router/CoeRouterService.deployRoute", () => {
  const baseRequest = {
    idoc,
    targetPid: "PID_SALESFORCE_CORE",
    targetQueue: "Common_JMS_ID_SFDC_Orders",
    endpointUri: "/cxf/salesforce/inbound/orders",
    track: "normal" as const,
  };

  it("writes the agreement (normal track) + QUEUE_JMS_/ROUTE_JMS_ keyed by the route key", async () => {
    const service = newService();
    const result = await service.deployRoute(baseRequest);
    assert.ok(result.allSucceeded);
    const routeKey = ".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA";
    assert.equal(result.routeKey, routeKey);

    // Agreement upserted under the registry PID with the target PID as its value.
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_JMS_Agreements" && p.id === ".SHOPIFY.S4HANA",
      ),
    );
    // Destination keyed by the 6-part route key under the target PID.
    assert.ok(
      result.created.some(
        (p) => p.pid === "PID_SALESFORCE_CORE" && p.id === `QUEUE_JMS_${routeKey}`,
      ),
    );
    assert.ok(result.created.some((p) => p.id === `ROUTE_JMS_${routeKey}`));
    assert.equal(result.warnings, undefined);
  });

  it("escalates a ruleset collision: deletes the plain agreement, merges candidates into RULESET_, and warns", async () => {
    const service = newService();
    const result = await service.deployRoute({
      ...baseRequest,
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
      customMapping: { enabled: true, condition: "pre", address: "/Map/PreJMS/Orders" },
      alerting: { to: "ops@example.com", cc: "", bcc: "", subject: "Order failed", maxRetries: 3 },
      optimization: { priority: "P1", sync: true, forceCacheRefresh: false },
    });
    assert.ok(result.allSucceeded);

    // The plain agreement (seeded PID_EXISTING_OWNER) is deleted, and RULESET_ now holds both targets.
    assert.ok(
      result.created.some(
        (p) =>
          p.pid === "_Maintain_JMS_Agreements" &&
          p.id === "RULESET_.SHOPIFY.S4HANA" &&
          p.status === "ok",
      ),
    );
    assert.ok(
      result.created.some(
        (p) =>
          p.pid === "_Maintain_JMS_Agreements" && p.id === ".SHOPIFY.S4HANA" && p.status === "ok",
      ),
    );
    assert.equal(result.warnings?.length, 1);
    assert.match(result.warnings![0]!, /Binary Parameter rule/);
    assert.deepEqual(result.rulesetFollowUps, [
      { storePid: "_Maintain_JMS_Agreements", ruleName: "PID_SALESFORCE_CORE" },
    ]);

    // The route parameters are still written under the target PID being deployed.
    const ids = result.created.map((p) => p.id);
    assert.ok(ids.includes("X-Routing"));
    assert.ok(ids.includes("X-Exception-To"));
    assert.ok(ids.includes("X-Priority"));

    // Once escalated, the pair stays a ruleset regardless of the next intended target.
    const recheck = await service.checkAgreement({
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
      mestyp: "ORDERS",
      targetPid: "ANY_OTHER_PID",
    });
    assert.equal(recheck.track, "ruleset");
    assert.equal(recheck.existingTargetPid, "PID_EXISTING_OWNER,PID_SALESFORCE_CORE");
  });
});

describe("modules/coe-router/CoeRouterService.checkRouterAgreement", () => {
  it("returns the normal track when no router agreement exists for the pair", async () => {
    const check = await newService().checkRouterAgreement({
      sndprn: "NEWSENDER",
      rcvprn: "NEWRECEIVER",
      mestyp: "ORDERS",
      routerPid: "Common_Router_Package",
    });
    assert.equal(check.track, "normal");
    assert.equal(check.agreementExists, false);
    assert.equal(check.agreementStorePid, "_Maintain_Router_Agreements");
    assert.equal(check.agreementKey, ".NEWSENDER.NEWRECEIVER");
  });

  it("returns the ruleset track when a router agreement points at a different package", async () => {
    // The mock store seeds `_Maintain_Router_Agreements` `.SHOPIFY.S4HANA` = Common_Router_Existing.
    const check = await newService().checkRouterAgreement({
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
      mestyp: "ORDERS",
      routerPid: "Common_Router_New",
    });
    assert.equal(check.track, "ruleset");
    assert.equal(check.agreementExists, true);
    assert.equal(check.existingTargetPid, "Common_Router_Existing");
    assert.equal(check.rulesetKey, "RULESET_.SHOPIFY.S4HANA");
  });
});

describe("modules/coe-router/CoeRouterService.deployCommonRouter", () => {
  const baseRequest = {
    idoc,
    routerPid: "Common_Router_Package",
    finalTargetPid: "PID_SALESFORCE_CORE",
    track: "normal" as const,
  };

  it("writes the router agreement + ROUTE_ mapping directly (no reference params)", async () => {
    const service = newService();
    const result = await service.deployCommonRouter(baseRequest);
    assert.ok(result.allSucceeded);
    const routeKey = ".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA";
    assert.equal(result.routeKey, routeKey);

    // Router agreement points the pair at the Common Router package.
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_Router_Agreements" && p.id === ".SHOPIFY.S4HANA",
      ),
    );
    // Route→target mapping under the router package — one hop, no Target_PID/X-Route-Key/Clean_Route_Key.
    assert.equal(result.created.length, 2);
    assert.ok(
      result.created.some((p) => p.pid === "Common_Router_Package" && p.id === `ROUTE_${routeKey}`),
    );
  });

  it("escalates a ruleset collision the same way as the JMS side", async () => {
    const service = newService();
    const result = await service.deployCommonRouter({
      ...baseRequest,
      routerPid: "Common_Router_New",
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });
    assert.ok(result.allSucceeded);
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_Router_Agreements" && p.id === "RULESET_.SHOPIFY.S4HANA",
      ),
    );
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_Router_Agreements" && p.id === ".SHOPIFY.S4HANA",
      ),
    );
    assert.ok(result.created.some((p) => p.id.startsWith("ROUTE_")));
    assert.equal(result.warnings?.length, 1);
    assert.deepEqual(result.rulesetFollowUps, [
      { storePid: "_Maintain_Router_Agreements", ruleName: "Common_Router_New" },
    ]);
  });

  it("substitutes ~ for * in the stored ROUTE_ id when a route part is missing", async () => {
    const service = newService();
    const result = await service.deployCommonRouter({
      ...baseRequest,
      idoc: { ...idoc, sndpor: "" },
    });
    assert.ok(result.allSucceeded);
    // Display route key keeps *, the stored id uses ~.
    assert.equal(result.routeKey, ".ORDERS05.ORDERS.*.SHOPIFY.SAP_TGT.S4HANA");
    assert.ok(
      result.created.some((p) => p.id === "ROUTE_.ORDERS05.ORDERS.~.SHOPIFY.SAP_TGT.S4HANA"),
    );
  });
});

describe("modules/coe-router/CoeRouterService.checkCombinedAgreement", () => {
  it("resolves both tracks independently — normal JMS with a colliding router", async () => {
    // Mock store seeds JMS `.SHOPIFY.S4HANA` = PID_EXISTING_OWNER and router `.SHOPIFY.S4HANA` =
    // Common_Router_Existing, so a fresh JMS target is normal while the router side collides.
    const check = await newService().checkCombinedAgreement({
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
      mestyp: "ORDERS",
      targetPid: "PID_EXISTING_OWNER",
      routerPid: "Common_Router_New",
    });
    assert.equal(check.jms.track, "normal");
    assert.equal(check.router.track, "ruleset");
    assert.equal(check.router.existingTargetPid, "Common_Router_Existing");
  });

  it("resolves both tracks as normal for a fresh partner pair", async () => {
    const check = await newService().checkCombinedAgreement({
      sndprn: "FRESHSND",
      rcvprn: "FRESHRCV",
      mestyp: "ORDERS",
      targetPid: "PID_NEW_TARGET",
      routerPid: "Common_Router_New",
    });
    assert.equal(check.jms.track, "normal");
    assert.equal(check.router.track, "normal");
  });
});

describe("modules/coe-router/CoeRouterService.lookupAgreement", () => {
  it("returns kind 'none' when no agreement exists for the pair", async () => {
    const result = await newService().lookupAgreement({
      type: "jms",
      sndprn: "NOBODY",
      rcvprn: "NOWHERE",
    });
    assert.equal(result.found, false);
    assert.equal(result.kind, "none");
    assert.equal(result.storePid, "_Maintain_JMS_Agreements");
  });

  it("returns kind 'normal' with the resolved target for a seeded JMS agreement", async () => {
    const result = await newService().lookupAgreement({
      type: "jms",
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
    });
    assert.equal(result.found, true);
    assert.equal(result.kind, "normal");
    assert.equal(result.targetPid, "PID_EXISTING_OWNER");
    assert.equal(result.candidates, undefined);
  });

  it("returns kind 'normal' with the resolved router package for a seeded router agreement", async () => {
    const result = await newService().lookupAgreement({
      type: "router",
      sndprn: "SHOPIFY",
      rcvprn: "S4HANA",
    });
    assert.equal(result.found, true);
    assert.equal(result.kind, "normal");
    assert.equal(result.storePid, "_Maintain_Router_Agreements");
    assert.equal(result.targetPid, "Common_Router_Existing");
  });

  it("returns kind 'ruleset' with every candidate's rule-authored status after an escalation", async () => {
    const { service, engine } = newServiceWithEngine();
    await service.deployRoute({
      idoc,
      targetPid: "PID_SALESFORCE_CORE",
      targetQueue: "Common_JMS_ID_SFDC_Orders",
      endpointUri: "/cxf/salesforce/inbound/orders",
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });

    // No Binary Parameter rule authored yet — both candidates should read as not-yet-authored.
    const beforeRule = await service.lookupAgreement({ type: "jms", sndprn: "SHOPIFY", rcvprn: "S4HANA" });
    assert.equal(beforeRule.kind, "ruleset");
    assert.deepEqual(
      [...beforeRule.candidates!].sort((a, b) => a.targetPid.localeCompare(b.targetPid)),
      [
        { targetPid: "PID_EXISTING_OWNER", ruleAuthored: false },
        { targetPid: "PID_SALESFORCE_CORE", ruleAuthored: false },
      ],
    );

    // Author a rule for one candidate — only that candidate should flip to ruleAuthored:true.
    await engine.partnerDirectory.saveBinaryParameter(
      "_Maintain_JMS_Agreements",
      "PID_SALESFORCE_CORE",
      "json;encoding=UTF-8",
      Buffer.from("{}").toString("base64"),
    );
    const afterRule = await service.lookupAgreement({ type: "jms", sndprn: "SHOPIFY", rcvprn: "S4HANA" });
    const byName = new Map(afterRule.candidates!.map((c) => [c.targetPid, c.ruleAuthored]));
    assert.equal(byName.get("PID_SALESFORCE_CORE"), true);
    assert.equal(byName.get("PID_EXISTING_OWNER"), false);
  });
});

describe("modules/coe-router/CoeRouterService.presentIn", () => {
  it("finds the plain JMS agreement entry that routes to a target PID", async () => {
    const result = await newService().presentIn("PID_EXISTING_OWNER");
    assert.ok(
      result.entries.some(
        (e) =>
          e.storePid === "_Maintain_JMS_Agreements" &&
          e.id === ".SHOPIFY.S4HANA" &&
          e.value === "PID_EXISTING_OWNER" &&
          e.isRuleset === false,
      ),
    );
  });

  it("finds the router agreement entry under the router registry", async () => {
    const result = await newService().presentIn("Common_Router_Existing");
    assert.ok(
      result.entries.some(
        (e) => e.storePid === "_Maintain_Router_Agreements" && e.isRuleset === false,
      ),
    );
  });

  it("finds a RULESET_ entry by any one of its comma-separated candidates", async () => {
    const service = newService();
    await service.deployRoute({
      idoc,
      targetPid: "PID_SALESFORCE_CORE",
      targetQueue: "Common_JMS_ID_SFDC_Orders",
      endpointUri: "/cxf/salesforce/inbound/orders",
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });
    const result = await service.presentIn("PID_SALESFORCE_CORE");
    assert.ok(
      result.entries.some(
        (e) =>
          e.storePid === "_Maintain_JMS_Agreements" &&
          e.id === "RULESET_.SHOPIFY.S4HANA" &&
          e.isRuleset === true &&
          e.value.split(",").includes("PID_SALESFORCE_CORE"),
      ),
    );
  });

  it("returns no entries for a PID that nothing routes to", async () => {
    const result = await newService().presentIn("PID_NOBODY_ROUTES_HERE");
    assert.deepEqual(result.entries, []);
  });
});

describe("modules/coe-router/CoeRouterService.deployJmsAndRouter", () => {
  const baseRequest = {
    idoc,
    targetPid: "PID_SALESFORCE_CORE",
    targetQueue: "Common_JMS_ID_SFDC_Orders",
    endpointUri: "/cxf/salesforce/inbound/orders",
    jmsTrack: "normal" as const,
    routerPid: "Common_Router_Package",
    routerTrack: "normal" as const,
  };

  it("writes both the JMS and router parameter sets, sharing one route key", async () => {
    const service = newService();
    const result = await service.deployJmsAndRouter(baseRequest);
    assert.ok(result.allSucceeded);
    const routeKey = ".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA";
    assert.equal(result.routeKey, routeKey);

    const ids = result.created.map((p) => `${p.pid}/${p.id}`);
    // JMS side.
    assert.ok(ids.includes(`_Maintain_JMS_Agreements/.SHOPIFY.S4HANA`));
    assert.ok(ids.includes(`PID_SALESFORCE_CORE/QUEUE_JMS_${routeKey}`));
    assert.ok(ids.includes(`PID_SALESFORCE_CORE/ROUTE_JMS_${routeKey}`));
    // Router side, pointed at the same targetPid as its finalTargetPid — no reference params.
    assert.ok(ids.includes(`_Maintain_Router_Agreements/.SHOPIFY.S4HANA`));
    assert.ok(ids.includes(`Common_Router_Package/ROUTE_${routeKey}`));
    assert.ok(!ids.includes(`Common_Router_Package/Target_PID`));
    assert.equal(result.warnings, undefined);
  });

  it("escalates only the ruleset-track side, leaving the normal-track side untouched", async () => {
    const service = newService();
    const result = await service.deployJmsAndRouter({
      ...baseRequest,
      jmsTrack: "ruleset",
      jmsRulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });
    assert.ok(result.allSucceeded);
    // JMS side escalated: RULESET_ written, plain key deleted.
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_JMS_Agreements" && p.id === "RULESET_.SHOPIFY.S4HANA",
      ),
    );
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_JMS_Agreements" && p.id === ".SHOPIFY.S4HANA",
      ),
    );
    // Router side stayed on the normal track: plain agreement write, no RULESET_.
    assert.ok(
      result.created.some(
        (p) => p.pid === "_Maintain_Router_Agreements" && p.id === ".SHOPIFY.S4HANA",
      ),
    );
    assert.ok(
      !result.created.some(
        (p) => p.pid === "_Maintain_Router_Agreements" && p.id === "RULESET_.SHOPIFY.S4HANA",
      ),
    );
    assert.equal(result.warnings?.length, 1);
    assert.deepEqual(result.rulesetFollowUps, [
      { storePid: "_Maintain_JMS_Agreements", ruleName: "PID_SALESFORCE_CORE" },
    ]);
  });
});

describe("modules/coe-router/validators", () => {
  const valid = {
    idoc,
    targetPid: "PID_SALESFORCE_CORE",
    targetQueue: "Common_JMS_ID_SFDC_Orders",
    endpointUri: "/cxf/salesforce/inbound/orders",
    track: "normal",
  };

  it("accepts a valid deploy payload", () => {
    assert.doesNotThrow(() => routeDeploySchema.parse(valid));
  });

  it("rejects an endpoint URI not starting with a slash", () => {
    assert.throws(() => routeDeploySchema.parse({ ...valid, endpointUri: "cxf/x" }));
  });

  it("rejects a bad target PID", () => {
    assert.throws(() => routeDeploySchema.parse({ ...valid, targetPid: "bad pid!" }));
  });

  it("accepts alerting maxRetries at the 5-retry ceiling", () => {
    assert.doesNotThrow(() =>
      routeDeploySchema.parse({
        ...valid,
        alerting: { to: "", cc: "", bcc: "", subject: "", maxRetries: 5 },
      }),
    );
  });

  it("rejects alerting maxRetries above the 5-retry ceiling", () => {
    assert.throws(() =>
      routeDeploySchema.parse({
        ...valid,
        alerting: { to: "", cc: "", bcc: "", subject: "", maxRetries: 6 },
      }),
    );
  });

  const validRouter = {
    idoc,
    routerPid: "Common_Router_Package",
    finalTargetPid: "PID_SALESFORCE_CORE",
    track: "normal",
  };

  it("accepts a valid Common Router deploy payload", () => {
    assert.doesNotThrow(() => routerDeploySchema.parse(validRouter));
  });

  it("rejects a Common Router payload with a bad router PID", () => {
    assert.throws(() => routerDeploySchema.parse({ ...validRouter, routerPid: "bad pid!" }));
  });

  const validCombined = {
    idoc,
    targetPid: "PID_SALESFORCE_CORE",
    targetQueue: "Common_JMS_ID_SFDC_Orders",
    endpointUri: "/cxf/salesforce/inbound/orders",
    jmsTrack: "normal",
    routerPid: "Common_Router_Package",
    routerTrack: "normal",
  };

  it("accepts a valid combined deploy payload", () => {
    assert.doesNotThrow(() => combinedDeploySchema.parse(validCombined));
  });

  it("rejects a combined payload with a bad endpoint URI", () => {
    assert.throws(() => combinedDeploySchema.parse({ ...validCombined, endpointUri: "no/slash" }));
  });
});
