/**
 * Unit tests for the pure recovery-path rendering helpers (Phase 13, §8/§9) — the compact and
 * multi-line path renderings, plan-row derivation, and the recovery-state/confidence semantic
 * mappings. Framework-free logic only, matching the `DetailBreadcrumb` precedent.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/controller/messageMonitoring/RecoveryPathFormatter"],
  function (RecoveryPathFormatter) {
    "use strict";

    QUnit.module("modules/messageMonitoring/controller/RecoveryPathFormatter");

    var DLQ_PATH = [
      { action: "LOCATED", queueName: "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q", description: "Dead-letter queue" },
      { action: "MOVE", queueName: "SAP_TPM_INBOUND_Q", description: "Move" },
      { action: "VERIFY", queueName: "SAP_TPM_INBOUND_Q", description: "Verify" },
      { action: "RETRY", queueName: "SAP_TPM_INBOUND_Q", description: "Retry" }
    ];

    var IN_PLACE_PATH = [
      { action: "LOCATED", queueName: "SAP_TPM_INBOUND_Q", description: "Active queue" },
      { action: "RETRY", queueName: "SAP_TPM_INBOUND_Q", description: "Retry" }
    ];

    var MANUAL_PATH = [
      { action: "MANUAL", queueName: undefined, description: "Investigate manually" }
    ];

    QUnit.test("formatPathSummary renders a DLQ recovery as queue → MOVE → queue → RETRY", function (assert) {
      assert.strictEqual(
        RecoveryPathFormatter.formatPathSummary(DLQ_PATH),
        "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q → MOVE → SAP_TPM_INBOUND_Q → RETRY"
      );
    });

    QUnit.test("formatPathSummary omits the VERIFY step from the compact form", function (assert) {
      var summary = RecoveryPathFormatter.formatPathSummary(DLQ_PATH);
      assert.strictEqual(
        summary.indexOf("VERIFY"),
        -1,
        "VERIFY is an internal safety gate, not an operator action, so it must not appear in the one-line summary"
      );
    });

    QUnit.test("formatPathSummary renders a retry in place without a MOVE", function (assert) {
      assert.strictEqual(
        RecoveryPathFormatter.formatPathSummary(IN_PLACE_PATH),
        "SAP_TPM_INBOUND_Q → RETRY"
      );
    });

    QUnit.test("formatPathSummary renders a manual path", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.formatPathSummary(MANUAL_PATH), "MANUAL");
    });

    QUnit.test("formatPathSummary returns an empty string for an empty path", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.formatPathSummary([]), "");
    });

    QUnit.test("formatPathBlock renders the indented multi-line flow", function (assert) {
      assert.strictEqual(
        RecoveryPathFormatter.formatPathBlock(DLQ_PATH),
        "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q\n" +
          "    ↓ MOVE\n" +
          "SAP_TPM_INBOUND_Q\n" +
          "    ↓ VERIFY\n" +
          "    ↓ RETRY"
      );
    });

    QUnit.test("formatPathBlock keeps VERIFY visible in the full form", function (assert) {
      assert.ok(
        RecoveryPathFormatter.formatPathBlock(DLQ_PATH).indexOf("VERIFY") !== -1,
        "the detail view shows every step, including the verification gate"
      );
    });

    QUnit.test("formatPathBlock returns an empty string for an empty path", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.formatPathBlock([]), "");
    });

    function plan(overrides) {
      var base = {
        messageId: "MSG-1",
        framework: "TPM_V2",
        recoveryState: "DLQ_RECOVERY_AVAILABLE",
        executable: true,
        path: DLQ_PATH,
        validations: [],
        explanation: "Explanation."
      };
      Object.keys(overrides || {}).forEach(function (key) {
        base[key] = overrides[key];
      });
      return base;
    }

    QUnit.test("toPlanRows lists executable messages before excluded ones", function (assert) {
      var rows = RecoveryPathFormatter.toPlanRows([
        plan({ messageId: "EXCLUDED", executable: false }),
        plan({ messageId: "RUNS", executable: true })
      ]);
      assert.strictEqual(rows.length, 2, "every selected message stays visible to the operator");
      assert.strictEqual(rows[0].messageId, "RUNS");
      assert.strictEqual(rows[1].messageId, "EXCLUDED");
    });

    QUnit.test("toPlanRows prefers a failed validation message as the exclusion reason", function (assert) {
      var rows = RecoveryPathFormatter.toPlanRows([
        plan({
          executable: false,
          validations: [
            { key: "messageLocated", passed: true, message: "Found." },
            { key: "dlqMappingExists", passed: false, message: "No recovery target is configured." }
          ]
        })
      ]);
      assert.strictEqual(
        rows[0].excludedReason,
        "No recovery target is configured.",
        "a precise validation failure beats the plan's general explanation"
      );
    });

    QUnit.test("toPlanRows falls back to the explanation when no validation failed", function (assert) {
      var rows = RecoveryPathFormatter.toPlanRows([
        plan({ executable: false, validations: [], explanation: "Nothing to recover." })
      ]);
      assert.strictEqual(rows[0].excludedReason, "Nothing to recover.");
    });

    QUnit.test("toPlanRows leaves no exclusion reason on an executable row", function (assert) {
      var rows = RecoveryPathFormatter.toPlanRows([plan({ executable: true })]);
      assert.strictEqual(rows[0].excludedReason, undefined);
      assert.strictEqual(rows[0].summary, RecoveryPathFormatter.formatPathSummary(DLQ_PATH));
    });

    QUnit.test("toPlanRows does not mutate the input array", function (assert) {
      var input = [
        plan({ messageId: "EXCLUDED", executable: false }),
        plan({ messageId: "RUNS", executable: true })
      ];
      RecoveryPathFormatter.toPlanRows(input);
      assert.strictEqual(input[0].messageId, "EXCLUDED", "sorting must not reorder the caller's array");
    });

    QUnit.test("recoveryStateValueState marks actionable states as Success", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("RETRY_AVAILABLE"), "Success");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("DLQ_RECOVERY_AVAILABLE"), "Success");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("RECOVERABLE"), "Success");
    });

    QUnit.test("recoveryStateValueState marks states needing a human as Warning", function (assert) {
      assert.strictEqual(
        RecoveryPathFormatter.recoveryStateValueState("MANUAL_INVESTIGATION_REQUIRED"),
        "Warning"
      );
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("NOT_FOUND"), "Warning");
    });

    QUnit.test("recoveryStateValueState marks a repeat failure as Error and UNSUPPORTED as neutral", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("FAILED_AGAIN"), "Error");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateValueState("UNSUPPORTED"), "None");
    });

    QUnit.test("recoveryStateIcon returns a distinct icon per meaningful state", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.recoveryStateIcon("RETRY_AVAILABLE"), "sap-icon://redo");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateIcon("COMPLETED"), "sap-icon://accept");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateIcon("FAILED_AGAIN"), "sap-icon://error");
      assert.strictEqual(RecoveryPathFormatter.recoveryStateIcon("RETRYING"), "sap-icon://pending");
    });

    QUnit.test("confidenceValueState flags a probable match as a warning, not a success", function (assert) {
      assert.strictEqual(RecoveryPathFormatter.confidenceValueState("confirmed"), "Success");
      assert.strictEqual(
        RecoveryPathFormatter.confidenceValueState("probable"),
        "Warning",
        "a name-shape-only match is indicative and the operator should see that before acting"
      );
      assert.strictEqual(RecoveryPathFormatter.confidenceValueState("none"), "None");
    });
  }
);
