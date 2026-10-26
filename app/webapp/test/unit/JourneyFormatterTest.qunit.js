/**
 * Unit tests for the transaction journey formatter: stage lines, the headline, action texts and
 * where each suggested action leads.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/journey/JourneyFormatter"],
  function (JourneyFormatter) {
    "use strict";

    QUnit.module("modules/journey/formatter/JourneyFormatter");

    /** Echoes the key and its arguments, so tests read which text was chosen. */
    function t(key, args) {
      return args && args.length ? key + "(" + args.join("|") + ")" : key;
    }

    function stage(kind, overrides) {
      return Object.assign(
        {
          kind: kind,
          name: "",
          state: "done",
          current: false,
          mplIds: [],
          failedRuns: 0,
        },
        overrides || {},
      );
    }

    function journey(overrides) {
      return Object.assign(
        {
          correlationId: "c1",
          category: "nonB2b",
          sender: "S4_LA",
          receiver: "SFDC",
          document: "ORDERS05",
          stages: [],
          diagnosis: { outcome: "completed", failedRuns: 0, overdue: false },
          actions: [],
        },
        overrides || {},
      );
    }

    QUnit.test("stage lines fall back to plain words when a name is unknown", function (assert) {
      assert.strictEqual(
        JourneyFormatter.stagePrimary(stage("router", { detail: "BTP_IS_CORE_LA" }), t),
        "name.router(BTP_IS_CORE_LA)",
      );
      assert.strictEqual(JourneyFormatter.stagePrimary(stage("router"), t), "name.router.unknown");
      assert.strictEqual(
        JourneyFormatter.stagePrimary(stage("jms", { name: "Common_JMS_ID_NA_P1" }), t),
        "Common_JMS_ID_NA_P1",
      );
      assert.strictEqual(
        JourneyFormatter.stagePrimary(stage("business"), t),
        "name.business.unknown",
      );
      assert.strictEqual(
        JourneyFormatter.stageSecondary(stage("sender", { detail: "AS2" }), t),
        "detail.sender(AS2)",
      );
      assert.strictEqual(JourneyFormatter.stageSecondary(stage("jms", { detail: "x" }), t), "");
    });

    QUnit.test("a parked stage reads as parked, others by state", function (assert) {
      assert.strictEqual(
        JourneyFormatter.stateText(
          stage("jms", { state: "failed", parked: { queueName: "Q" } }),
          t,
        ),
        "state.parked",
      );
      assert.strictEqual(
        JourneyFormatter.stateText(stage("jms", { state: "active" }), t),
        "state.active",
      );
      assert.strictEqual(JourneyFormatter.stateValue("failed"), "Error");
      assert.strictEqual(JourneyFormatter.stateValue(undefined), "None");
    });

    QUnit.test("runsText counts logs and failures", function (assert) {
      assert.strictEqual(JourneyFormatter.runsText(stage("jms"), t), "");
      assert.strictEqual(
        JourneyFormatter.runsText(stage("jms", { mplIds: ["a"] }), t),
        "runs.one(1)",
      );
      assert.strictEqual(
        JourneyFormatter.runsText(stage("jms", { mplIds: ["a", "b", "c"], failedRuns: 2 }), t),
        "runs.withFailures(runs.many(3)|2)",
      );
    });

    QUnit.test("the headline says where the transaction is", function (assert) {
      assert.strictEqual(JourneyFormatter.headline(journey(), t), "outcome.completed(SFDC)");
      var parked = journey({
        stages: [
          stage("router", { state: "failed", current: true, parked: { queueName: "Router_DLQ" } }),
        ],
        diagnosis: { outcome: "stuck", stage: "router", failedRuns: 1, overdue: false },
      });
      assert.strictEqual(
        JourneyFormatter.headline(parked, t),
        "outcome.stuck.parked(stage.router|Router_DLQ)",
      );
      var moving = journey({
        stages: [stage("jms", { state: "active", current: true })],
        diagnosis: { outcome: "inProgress", stage: "jms", failedRuns: 0, overdue: false },
      });
      assert.strictEqual(JourneyFormatter.headline(moving, t), "outcome.inProgress(stage.jms)");
      assert.strictEqual(JourneyFormatter.headline(null, t), "");
      assert.strictEqual(JourneyFormatter.subline(journey(), t), "ORDERS05 · S4_LA → SFDC");
    });

    QUnit.test("B2B actions use the TPM wording", function (assert) {
      var fix = { code: "fixMapping", primary: true };
      assert.strictEqual(JourneyFormatter.actionTitle(fix, "nonB2b", t), "action.fixMapping.title");
      assert.strictEqual(
        JourneyFormatter.actionTitle(fix, "b2b", t),
        "action.fixMapping.b2b.title",
      );
      assert.strictEqual(
        JourneyFormatter.actionText(
          { code: "retry", primary: true, queueName: "DLQ", target: "Q1" },
          journey(),
          t,
        ),
        "action.retry.text(DLQ|Q1)",
      );
    });

    QUnit.test("each action links to where it can be done", function (assert) {
      var j = journey({ category: "nonB2b" });
      assert.deepEqual(
        JourneyFormatter.actionLink({ code: "retry", primary: true, jmsMessageId: "ID:1" }, j),
        {
          route: "failedTransactions",
          parameters: { "?query": { category: "nonB2b", search: "ID:1" } },
          labelKey: "go.failedTransactions",
        },
      );
      assert.strictEqual(
        JourneyFormatter.actionLink({ code: "checkPartnerDirectory", primary: true }, j).route,
        "coePartnersRoutes",
      );
      assert.deepEqual(
        JourneyFormatter.actionLink({ code: "investigate", primary: true, mplId: "m1" }, j)
          .parameters,
        { mplId: "m1" },
      );
      assert.strictEqual(
        JourneyFormatter.actionLink({ code: "investigate", primary: true }, j),
        undefined,
        "nothing to open without a log",
      );
      var b2b = journey({ category: "b2b" });
      assert.deepEqual(
        JourneyFormatter.actionLink(
          { code: "fixMapping", primary: true, interchangeId: "ic1", mplId: "m1" },
          b2b,
        ).parameters,
        { interchangeId: "ic1" },
        "B2B fixes open the interchange",
      );
      assert.strictEqual(
        JourneyFormatter.actionLink({ code: "wait", primary: true }, j),
        undefined,
      );
    });

    QUnit.test("elapsed reads as minutes, hours and days", function (assert) {
      var now = new Date(Date.UTC(2026, 9, 26, 12, 0, 0));
      assert.strictEqual(JourneyFormatter.elapsed("2026-10-26T11:59:40Z", now), "< 1 min");
      assert.strictEqual(JourneyFormatter.elapsed("2026-10-26T11:20:00Z", now), "40 min");
      assert.strictEqual(JourneyFormatter.elapsed("2026-10-26T09:55:00Z", now), "2 h 5 min");
      assert.strictEqual(JourneyFormatter.elapsed("2026-10-24T09:00:00Z", now), "2 d 3 h");
      assert.strictEqual(JourneyFormatter.elapsed(undefined, now), "");
    });
  },
);
