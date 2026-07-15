/**
 * Unit tests for the Certificate & Security Center formatter — health/risk-score/self-signed/
 * weak-algorithm/availability/timeline-event mappings the Dashboard, Certificate Explorer, Security
 * Materials and Timeline surfaces bind through.
 */
sap.ui.define(
  [
    "com/middlewareops/integrationportal/formatter/certificateSecurityCenter/CertificateSecurityCenterFormatter",
  ],
  function (CertificateSecurityCenterFormatter) {
    "use strict";

    QUnit.module("modules/certificateSecurityCenter/formatter/CertificateSecurityCenterFormatter");

    QUnit.test(
      "healthState/healthIcon delegate to the shared formatter library",
      function (assert) {
        assert.strictEqual(CertificateSecurityCenterFormatter.healthState("healthy"), "Success");
        assert.strictEqual(CertificateSecurityCenterFormatter.healthState("critical"), "Error");
        assert.strictEqual(
          CertificateSecurityCenterFormatter.healthIcon("healthy"),
          "sap-icon://sys-enter-2",
        );
      },
    );

    QUnit.test("riskScoreState buckets a 0-100 risk score (high risk is bad)", function (assert) {
      assert.strictEqual(CertificateSecurityCenterFormatter.riskScoreState(80), "Error");
      assert.strictEqual(CertificateSecurityCenterFormatter.riskScoreState(40), "Warning");
      assert.strictEqual(CertificateSecurityCenterFormatter.riskScoreState(0), "Success");
    });

    QUnit.test(
      "selfSignedText/selfSignedState honestly reflect the undetermined case",
      function (assert) {
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedText(true), "Yes");
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedText(false), "No");
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedText(undefined), "Unknown");
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedState(true), "Warning");
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedState(false), "Success");
        assert.strictEqual(CertificateSecurityCenterFormatter.selfSignedState(undefined), "None");
      },
    );

    QUnit.test("weakAlgorithmState flags a weak algorithm as an error", function (assert) {
      assert.strictEqual(CertificateSecurityCenterFormatter.weakAlgorithmState(true), "Error");
      assert.strictEqual(CertificateSecurityCenterFormatter.weakAlgorithmState(false), "Success");
    });

    QUnit.test(
      "availabilityState/availabilityIcon distinguish available from reserved categories",
      function (assert) {
        assert.strictEqual(CertificateSecurityCenterFormatter.availabilityState(true), "Success");
        assert.strictEqual(CertificateSecurityCenterFormatter.availabilityState(false), "None");
        assert.strictEqual(
          CertificateSecurityCenterFormatter.availabilityIcon(true),
          "sap-icon://sys-enter-2",
        );
      },
    );

    QUnit.test(
      "timelineEventIcon/timelineEventState distinguish every timeline event kind",
      function (assert) {
        assert.strictEqual(
          CertificateSecurityCenterFormatter.timelineEventIcon("imported"),
          "sap-icon://add-document",
        );
        assert.strictEqual(
          CertificateSecurityCenterFormatter.timelineEventIcon("flaggedForRenewal"),
          "sap-icon://flag",
        );
        assert.strictEqual(
          CertificateSecurityCenterFormatter.timelineEventState("expired"),
          "Error",
        );
        assert.strictEqual(
          CertificateSecurityCenterFormatter.timelineEventState("flaggedForRenewal"),
          "Warning",
        );
        assert.strictEqual(
          CertificateSecurityCenterFormatter.timelineEventState("imported"),
          "None",
        );
      },
    );

    QUnit.test(
      "reservedText renders a placeholder for an undefined extension-point field",
      function (assert) {
        assert.strictEqual(
          CertificateSecurityCenterFormatter.reservedText(undefined),
          "Not available",
        );
        assert.strictEqual(CertificateSecurityCenterFormatter.reservedText("RSA"), "RSA");
      },
    );

    QUnit.test("hasItems reflects whether a count is greater than zero", function (assert) {
      assert.strictEqual(CertificateSecurityCenterFormatter.hasItems(0), false);
      assert.strictEqual(CertificateSecurityCenterFormatter.hasItems(3), true);
    });
  },
);
