/**
 * Integration (OPA5) smoke test.
 *
 * Boots the root component and asserts the shell chrome renders. Serves as the reference pattern
 * for module-level OPA journeys added in later phases (each module gets its own journey + page
 * objects under this folder).
 */
sap.ui.define([
  "sap/ui/test/opaQunit",
  "sap/ui/test/Opa5",
], function (opaTest, Opa5) {
  "use strict";

  QUnit.module("Shell smoke journey");

  Opa5.extendConfig({
    autoWait: true,
    timeout: 30,
    viewNamespace: "com.middlewareops.integrationportal.",
  });

  opaTest("Application starts and renders the shell tool page", function (Given, When, Then) {
    Given.iStartMyUIComponent({
      componentConfig: { name: "com.middlewareops.integrationportal" },
    });

    Then.waitFor({
      controlType: "sap.tnt.ToolPage",
      success: function () {
        Opa5.assert.ok(true, "The shell ToolPage is rendered.");
      },
      errorMessage: "The shell ToolPage did not render.",
    });

    Then.iTeardownMyUIComponent();
  });
});
