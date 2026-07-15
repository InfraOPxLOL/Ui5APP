/**
 * Unit tests for the UserContext (§10, §19). Built via createForTest with injected sources so no
 * live session, tenant or theme is needed.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/context/UserContext",
], function (UserContext) {
  "use strict";

  function makeContext(scopes) {
    return UserContext.createForTest({
      session: {
        getUser: function () {
          return {
            id: "S000123",
            name: "Ada Lovelace",
            email: "ada@example.com",
            scopes: scopes,
          };
        },
      },
      tenants: {
        getCurrentTenant: function () {
          return { id: "t1", name: "Production" };
        },
      },
      favorites: {
        getSnapshot: function () {
          return {
            favoriteWorkspaces: ["operations"],
            favoriteModules: [],
            pinnedActions: [],
            recentWorkspaces: [],
            recentModules: [],
          };
        },
        recordRecentWorkspace: function () {
          /* no-op for the test */
        },
      },
      theme: {
        getActiveTheme: function () {
          return "sap_horizon";
        },
      },
    });
  }

  QUnit.module("shell/context/UserContext");

  QUnit.test("exposes identity from the session", function (assert) {
    var context = makeContext(["Viewer", "Operator"]);
    context.initialize("test");
    assert.strictEqual(context.getDisplayName(), "Ada Lovelace");
    assert.strictEqual(context.getEmail(), "ada@example.com");
    assert.strictEqual(context.getUserId(), "S000123");
  });

  QUnit.test("resolves permissions and role collections from scopes", function (assert) {
    var context = makeContext(["Viewer", "Operator"]);
    context.initialize("test");
    assert.deepEqual(context.getResolvedPermissions(), ["Operator", "Viewer"]);
    var collections = context.getAssignedRoleCollections();
    assert.ok(collections.indexOf("IntegrationPortal_Viewer") >= 0, "viewer collection resolved");
    assert.ok(collections.indexOf("PI_OPERATIONS_ADMIN") >= 0, "operations admin resolved");
  });

  QUnit.test("tracks the current workspace", function (assert) {
    var context = makeContext(["Viewer"]);
    context.initialize("test");
    assert.strictEqual(context.getCurrentWorkspaceId(), "", "no workspace initially");
    context.setCurrentWorkspace("operations");
    assert.strictEqual(context.getCurrentWorkspaceId(), "operations");
  });

  QUnit.test("exposes theme, language and a bindable snapshot", function (assert) {
    var context = makeContext(["Viewer"]);
    context.initialize("test");
    assert.strictEqual(context.getTheme(), "sap_horizon");
    assert.strictEqual(typeof context.getLanguage(), "string");
    var snapshot = context.toSnapshot();
    assert.strictEqual(snapshot.displayName, "Ada Lovelace");
    assert.deepEqual(snapshot.favoriteWorkspaces, ["operations"]);
    assert.strictEqual(snapshot.currentTenant.id, "t1");
    assert.strictEqual(snapshot.session.authenticated, true);
  });
});
