/**
 * Unit tests for the Failed Transactions formatter: dead-letter and outcome states, the recovery
 * path sentence, partner/document fallbacks, and bulk-outcome tallies.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/failedTransactions/FailedTransactionsFormatter"],
  function (FailedTransactionsFormatter) {
    "use strict";

    QUnit.module("modules/failedTransactions/formatter/FailedTransactionsFormatter");

    var LABELS = { move: "Move to", verify: "Verify it arrived", retry: "Retry", manual: "Manual" };

    function result(status, steps) {
      return {
        messageId: "m",
        queueName: "q",
        outcome: { messageId: "m", status: status, steps: steps || [], note: "note" },
      };
    }

    QUnit.test("dead-letter state: processing is an error, delivery a warning", function (assert) {
      assert.strictEqual(FailedTransactionsFormatter.deadLetterState("processing"), "Error");
      assert.strictEqual(FailedTransactionsFormatter.deadLetterState("receiver"), "Warning");
      assert.strictEqual(FailedTransactionsFormatter.deadLetterState("other"), "None");
    });

    QUnit.test(
      "non-B2B dead letters: JMS failures are errors, router failures warnings",
      function (assert) {
        assert.strictEqual(FailedTransactionsFormatter.deadLetterState("jms"), "Error");
        assert.strictEqual(FailedTransactionsFormatter.deadLetterState("router"), "Warning");
        assert.strictEqual(FailedTransactionsFormatter.deadLetterState(undefined), "None");
        assert.strictEqual(FailedTransactionsFormatter.deadLetterColor("jms"), "Error");
        assert.strictEqual(FailedTransactionsFormatter.deadLetterColor("processing"), "Error");
        assert.strictEqual(FailedTransactionsFormatter.deadLetterColor("router"), "Critical");
      },
    );

    QUnit.test("transaction title prefers the business flow", function (assert) {
      assert.strictEqual(
        FailedTransactionsFormatter.transactionTitle({
          businessFlow: "IF_Order_to_SFDC",
          messageType: "ORDERS05",
        }),
        "IF_Order_to_SFDC",
      );
      assert.strictEqual(
        FailedTransactionsFormatter.transactionTitle({ messageType: "ORDERS05" }),
        "ORDERS05",
      );
      assert.strictEqual(FailedTransactionsFormatter.transactionTitle(undefined), "—");
      assert.strictEqual(
        FailedTransactionsFormatter.pathText(["Common IDoc Router (BTP_IS_CORE_LA)", "JMS"]),
        "Common IDoc Router (BTP_IS_CORE_LA) → JMS",
      );
      assert.strictEqual(FailedTransactionsFormatter.pathText(undefined), "");
    });

    QUnit.test("only a JMS dead letter without a target needs a queue choice", function (assert) {
      function needs(row) {
        return FailedTransactionsFormatter.needsQueueChoice(row);
      }
      assert.strictEqual(needs({ deadLetterKind: "jms" }), true);
      assert.strictEqual(needs({ deadLetterKind: "jms", targetQueue: null }), true);
      assert.strictEqual(needs({ deadLetterKind: "jms", targetQueue: "" }), true);
      assert.strictEqual(
        needs({ deadLetterKind: "jms", targetQueue: "Common_JMS_ID_NA_P1" }),
        false,
      );
      assert.strictEqual(needs({ deadLetterKind: "router" }), false);
      assert.strictEqual(needs({ deadLetterKind: "processing" }), false);
      assert.strictEqual(needs(undefined), false);
    });

    QUnit.test("outcome state never shows a refused retry as a success", function (assert) {
      assert.strictEqual(FailedTransactionsFormatter.outcomeState("accepted"), "Success");
      assert.strictEqual(
        FailedTransactionsFormatter.outcomeState("already-processed"),
        "Information",
      );
      assert.strictEqual(FailedTransactionsFormatter.outcomeState("unavailable"), "Warning");
      assert.strictEqual(FailedTransactionsFormatter.outcomeState("failed"), "Error");
    });

    QUnit.test("pathSummary spells out a dead-letter recovery", function (assert) {
      var path = [
        {
          action: "LOCATED",
          queueName: "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
          description: "",
        },
        { action: "MOVE", queueName: "SAP_TPM_INBOUND_Q", description: "" },
        { action: "VERIFY", queueName: "SAP_TPM_INBOUND_Q", description: "" },
        { action: "RETRY", queueName: "SAP_TPM_INBOUND_Q", description: "" },
      ];
      assert.strictEqual(
        FailedTransactionsFormatter.pathSummary(path, LABELS),
        "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q → Move to SAP_TPM_INBOUND_Q → Verify it arrived → Retry",
      );
      assert.strictEqual(FailedTransactionsFormatter.pathSummary([], LABELS), "");
      assert.strictEqual(
        FailedTransactionsFormatter.pathSummary(
          [
            { action: "LOCATED", queueName: "DLQ", description: "" },
            { action: "MANUAL", description: "" },
          ],
          LABELS,
        ),
        "DLQ → Manual",
      );
    });

    QUnit.test(
      "partners and document prefer the interchange over broker headers",
      function (assert) {
        var linked = {
          sender: "S",
          receiver: "R",
          messageType: "MT",
          interchange: {
            senderPartner: "AMAZONJP",
            receiverPartner: "US",
            documentStandard: "ASC-X12",
            messageType: "850",
          },
        };
        assert.strictEqual(FailedTransactionsFormatter.senderPartner(linked), "AMAZONJP");
        assert.strictEqual(FailedTransactionsFormatter.receiverPartner(linked), "US");
        assert.strictEqual(FailedTransactionsFormatter.document(linked), "ASC-X12 · 850");

        var unlinked = { sender: "S", receiver: "R", messageType: "MT" };
        assert.strictEqual(FailedTransactionsFormatter.senderPartner(unlinked), "S");
        assert.strictEqual(FailedTransactionsFormatter.document(unlinked), "MT");
        assert.strictEqual(FailedTransactionsFormatter.document({}), "—");
      },
    );

    QUnit.test("attempts state escalates with repeated failures", function (assert) {
      assert.strictEqual(FailedTransactionsFormatter.attemptsState({ failedAttempts: 1 }), "None");
      assert.strictEqual(
        FailedTransactionsFormatter.attemptsState({ failedAttempts: 2 }),
        "Warning",
      );
      assert.strictEqual(FailedTransactionsFormatter.attemptsState({ failedAttempts: 5 }), "Error");
    });

    QUnit.test("tally counts each outcome kind", function (assert) {
      var tally = FailedTransactionsFormatter.tally([
        result("accepted"),
        result("accepted"),
        result("already-processed"),
        result("failed"),
        result("unavailable"),
      ]);
      assert.deepEqual(tally, { accepted: 2, alreadyProcessed: 1, failed: 1, unavailable: 1 });
    });

    QUnit.test(
      "stoppedAt names the failed step, or the last step when all succeeded",
      function (assert) {
        var stopped = result("failed", [
          { action: "LOCATED", succeeded: true, detail: "Confirmed on DLQ." },
          { action: "MOVE", succeeded: false, detail: "Move failed: 503" },
        ]);
        assert.strictEqual(FailedTransactionsFormatter.stoppedAt(stopped), "Move failed: 503");
        var done = result("accepted", [
          { action: "MOVE", succeeded: true, detail: "Moved." },
          { action: "RETRY", succeeded: true, detail: "Retry accepted." },
        ]);
        assert.strictEqual(FailedTransactionsFormatter.stoppedAt(done), "Retry accepted.");
        assert.strictEqual(FailedTransactionsFormatter.stoppedAt(result("unavailable")), "note");
      },
    );
  },
);
