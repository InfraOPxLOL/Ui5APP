import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoePartnerDashboardService } from "../../../src/modules/coe-partner-dashboard/service.js";
import {
  CoeRouterService,
  fromStorageKey,
  parseRouteKey,
  toStorageKey,
} from "../../../src/modules/coe-router/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

/** Shares one SDK client across both services so the stateful mock PD store persists across calls. */
function newHarness(): {
  router: CoeRouterService;
  dashboard: CoePartnerDashboardService;
  engine: OperationsEngine;
} {
  const sdk = new IntegrationSuiteSdkClient({
    defaultTenantId: "primary",
    mockEngineConfig: { enabled: true, defaultScenario: "success" },
  });
  const engine = new OperationsEngine({ sdk, queueConfigs: [] });
  return {
    router: new CoeRouterService(() => engine),
    dashboard: new CoePartnerDashboardService(() => engine),
    engine,
  };
}

const idoc = {
  sndprn: "SHOPIFY",
  rcvprn: "S4HANA",
  mestyp: "ORDERS",
  idoctyp: "ORDERS05",
  sndpor: "SAP_S4H",
  rcvpor: "SAP_TGT",
};

describe("modules/coe-router route-key reversal", () => {
  it("fromStorageKey reverses toStorageKey", () => {
    const displayed = ".ORDERS05.ORDERS.*.SHOPIFY.*.S4HANA";
    assert.equal(fromStorageKey(toStorageKey(displayed)), displayed);
  });

  it("parseRouteKey splits a well-formed key into its six parts", () => {
    assert.deepEqual(parseRouteKey(".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA"), {
      idoctyp: "ORDERS05",
      mestyp: "ORDERS",
      sndpor: "SAP_S4H",
      sndprn: "SHOPIFY",
      rcvpor: "SAP_TGT",
      rcvprn: "S4HANA",
    });
  });

  it("parseRouteKey returns undefined for a malformed key", () => {
    assert.equal(parseRouteKey("not-a-route-key"), undefined);
    assert.equal(parseRouteKey(".too.few.parts"), undefined);
  });
});

describe("modules/coe-partner-dashboard/CoePartnerDashboardService.listPartners", () => {
  it("derives the master list from both agreement registries' seed data", async () => {
    const { dashboard } = newHarness();
    const { partners } = await dashboard.listPartners();

    const jmsOwner = partners.find((p) => p.pid === "PID_EXISTING_OWNER");
    assert.ok(jmsOwner);
    assert.equal(jmsOwner!.jmsAgreementCount, 1);
    assert.equal(jmsOwner!.routerAgreementCount, 0);

    const routerPkg = partners.find((p) => p.pid === "Common_Router_Existing");
    assert.ok(routerPkg);
    assert.equal(routerPkg!.jmsAgreementCount, 0);
    assert.equal(routerPkg!.routerAgreementCount, 1);
  });

  it("counts every ruleset candidate once escalated", async () => {
    const { router, dashboard } = newHarness();
    await router.deployRoute({
      idoc,
      targetPid: "PID_DASH_NEWTARGET",
      targetQueue: "Common_JMS_ID_NA_P2",
      endpointUri: "/cxf/dash/new",
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });
    const { partners } = await dashboard.listPartners();
    const original = partners.find((p) => p.pid === "PID_EXISTING_OWNER");
    const escalated = partners.find((p) => p.pid === "PID_DASH_NEWTARGET");
    assert.equal(original!.jmsAgreementCount, 1);
    assert.equal(escalated!.jmsAgreementCount, 1);
  });
});

describe("modules/coe-partner-dashboard/CoePartnerDashboardService.getPartnerDetail", () => {
  it("decodes a JMS route's queue + endpoint from its stored parameters", async () => {
    const { router, dashboard } = newHarness();
    await router.deployRoute({
      idoc,
      targetPid: "PID_DASH_JMS",
      targetQueue: "Common_JMS_ID_NA_P2",
      endpointUri: "/cxf/dash/jms",
      track: "normal",
    });
    const detail = await dashboard.getPartnerDetail("PID_DASH_JMS");
    assert.equal(detail.jmsRoutes.length, 1);
    const route = detail.jmsRoutes[0]!;
    assert.equal(route.routeKey, ".ORDERS05.ORDERS.SAP_S4H.SHOPIFY.SAP_TGT.S4HANA");
    assert.equal(route.sndprn, "SHOPIFY");
    assert.equal(route.rcvprn, "S4HANA");
    assert.equal(route.queue, "Common_JMS_ID_NA_P2");
    assert.equal(route.endpointUri, "/cxf/dash/jms");
    assert.equal(route.mappingAddress, undefined);
    assert.equal(detail.routerRoutes.length, 0);
  });

  it("decodes a missing route-key part (~ -> *) correctly", async () => {
    const { router, dashboard } = newHarness();
    await router.deployRoute({
      idoc: { ...idoc, sndpor: "", rcvpor: "" },
      targetPid: "PID_DASH_PARTIAL",
      targetQueue: "Common_JMS_ID_NA_P2",
      endpointUri: "/cxf/dash/partial",
      track: "normal",
    });
    const detail = await dashboard.getPartnerDetail("PID_DASH_PARTIAL");
    assert.equal(detail.jmsRoutes.length, 1);
    assert.equal(detail.jmsRoutes[0]!.sndpor, "*");
    assert.equal(detail.jmsRoutes[0]!.rcvpor, "*");
  });

  it("decodes a Router route's final target PID", async () => {
    const { router, dashboard } = newHarness();
    await router.deployCommonRouter({
      idoc,
      routerPid: "Common_Router_Dash",
      finalTargetPid: "PID_DASH_FINAL",
      track: "normal",
    });
    const detail = await dashboard.getPartnerDetail("Common_Router_Dash");
    assert.equal(detail.routerRoutes.length, 1);
    assert.equal(detail.routerRoutes[0]!.finalTargetPid, "PID_DASH_FINAL");
    assert.equal(detail.jmsRoutes.length, 0);
  });

  it("surfaces non-route parameters as otherParameters, not routes", async () => {
    const { router, dashboard } = newHarness();
    await router.deployRoute({
      idoc,
      targetPid: "PID_DASH_ADVANCED",
      targetQueue: "Common_JMS_ID_NA_P2",
      endpointUri: "/cxf/dash/advanced",
      track: "normal",
      optimization: { priority: "P1", sync: true, forceCacheRefresh: false },
    });
    const detail = await dashboard.getPartnerDetail("PID_DASH_ADVANCED");
    const otherIds = detail.otherParameters.map((p) => p.id);
    assert.ok(otherIds.includes("X-Priority"));
    assert.ok(otherIds.includes("X-Sync"));
    assert.ok(!otherIds.some((id) => id.startsWith("QUEUE_JMS_")));
  });

  it("finds the plain agreement referencing this partner (referencedBy)", async () => {
    const { dashboard } = newHarness();
    const detail = await dashboard.getPartnerDetail("PID_EXISTING_OWNER");
    assert.ok(
      detail.referencedBy.some(
        (r) =>
          r.storePid === "_Maintain_JMS_Agreements" &&
          r.id === ".SHOPIFY.S4HANA" &&
          r.isRuleset === false &&
          r.ruleAuthored === undefined,
      ),
    );
  });

  it("flags ruleAuthored per ruleset candidate once a Binary Parameter rule exists", async () => {
    const { router, dashboard, engine } = newHarness();
    await router.deployRoute({
      idoc,
      targetPid: "PID_DASH_RULESET",
      targetQueue: "Common_JMS_ID_NA_P2",
      endpointUri: "/cxf/dash/ruleset",
      track: "ruleset",
      rulesetKey: "RULESET_.SHOPIFY.S4HANA",
    });

    const before = await dashboard.getPartnerDetail("PID_DASH_RULESET");
    const beforeRef = before.referencedBy.find((r) => r.isRuleset);
    assert.equal(beforeRef?.isRuleset, true);
    assert.equal(beforeRef?.ruleAuthored, false);

    await engine.partnerDirectory.saveBinaryParameter(
      "_Maintain_JMS_Agreements",
      "PID_DASH_RULESET",
      "json;encoding=UTF-8",
      Buffer.from("{}").toString("base64"),
    );
    const after = await dashboard.getPartnerDetail("PID_DASH_RULESET");
    const afterRef = after.referencedBy.find((r) => r.isRuleset);
    assert.equal(afterRef?.ruleAuthored, true);
  });
});
