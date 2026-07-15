/**
 * Unit test aggregator. Requires every unit test module so the suite loads them as one page.
 * Add new `*.qunit` unit modules to the dependency list.
 */
sap.ui.define(
  [
    "./DurationFormatterTest.qunit",
    "./SizeFormatterTest.qunit",
    "./StringUtilsTest.qunit",
    "./SearchUtilsTest.qunit",
    "./PermissionEngineTest.qunit",
    "./WorkspaceRegistryTest.qunit",
    "./NavigationServiceTest.qunit",
    "./RouteGuardTest.qunit",
    "./ShellViewBuilderTest.qunit",
    "./FavoritesServiceTest.qunit",
    "./QuickActionRegistryTest.qunit",
    "./TenantContextTest.qunit",
    "./UserContextTest.qunit",
    "./OperationsFormatterTest.qunit",
    "./MessageMonitoringFormatterTest.qunit",
    "./DetailBreadcrumbTest.qunit",
    "./TextSearchUtilsTest.qunit",
    "./PayloadCompareUtilsTest.qunit",
    "./PayloadStatisticsUtilsTest.qunit",
    "./PayloadValidationUtilsTest.qunit",
    "./PayloadStudioFormatterTest.qunit",
    "./RecoveryCenterFormatterTest.qunit",
    "./RecoveryLayoutServiceTest.qunit",
    "./RuntimeCenterFormatterTest.qunit",
    "./CertificateSecurityCenterFormatterTest.qunit",
  ],
  function () {
    "use strict";
  },
);
