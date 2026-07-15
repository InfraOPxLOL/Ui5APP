# Frontend tests

QUnit unit tests and OPA5 integration tests for the UI5 frontend, in the **SAP-standard location**
`webapp/test/` — which UI5 tooling automatically serves at `/test-resources/<namespace>/**`, so the
suite is runnable directly in the browser (no extra runner wiring required).

## Layout

| Path | Purpose |
|---|---|
| `testsuite.qunit.html` / `testsuite.qunit.js` | UI5 test-starter entry and suite descriptor. |
| `unit/unitTests.qunit.html` | Runnable page for the unit suite. |
| `unit/unitTests.qunit.js` | Aggregator that requires every unit test module. |
| `unit/*.qunit.js` | QUnit unit tests for pure modules (formatters, utils, registries, services). |
| `integration/opaTests.qunit.html` | Runnable page for the OPA5 suite. |
| `integration/opaTests.qunit.js` | OPA5 journeys driving the running app (shell smoke test). |

## Running

With the frontend dev server running (`cd app && npm start`, serves on `http://localhost:8080`):

- **Unit tests:** open <http://localhost:8080/test/unit/unitTests.qunit.html>
- **Integration (OPA5) tests:** open <http://localhost:8080/test/integration/opaTests.qunit.html>
- **Full suite menu:** open <http://localhost:8080/test/testsuite.qunit.html>

The runner pages map the `com.middlewareops.integrationportal` namespace to the app root, so each test
requires the module under test by its normal resource path (e.g.
`com/middlewareops/integrationportal/core/utils/StringUtils`); the dev server transpiles the
TypeScript source on the fly.

## Conventions

- **Unit tests** target pure, dependency-light modules. Each test module requires the module under
  test by its resource path and asserts known input/output pairs. Register new unit modules in
  `unit/unitTests.qunit.js`.
- **Integration tests** are OPA5 journeys; each contributes its own journey plus page objects here.

These `*.qunit.js` assets are plain JS loaded by the UI5 test runner (not part of the TypeScript
sources) and are excluded from the production `ui5 build` output (`builder.resources.excludes` in
`app/ui5.yaml`).
