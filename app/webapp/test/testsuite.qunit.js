/**
 * UI5 test starter suite descriptor.
 *
 * Declares the QUnit unit suite and the OPA5 integration suite. New test modules are added to the
 * respective `unit/` or `integration/` entry aggregator; this descriptor rarely changes.
 */
sap.ui.define(function () {
  "use strict";

  return {
    name: "Integration Portal - Test Suite",
    defaults: {
      page: "ui5://test-resources/com/middlewareops/integrationportal/Test.qunit.html?testsuite={suite}&test={name}",
      qunit: { version: 2 },
      ui5: {
        theme: "sap_horizon",
        language: "EN",
      },
      loader: {
        paths: {
          "com/middlewareops/integrationportal": "../",
        },
      },
    },
    tests: {
      "unit/unitTests": {
        title: "Integration Portal - Unit Tests",
      },
      "integration/opaTests": {
        title: "Integration Portal - Integration (OPA5) Tests",
      },
    },
  };
});
