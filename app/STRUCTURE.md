# Frontend structure (SAP UI5 + TypeScript)

This app follows SAP UI5 / Fiori-tools conventions — **XML views**, strict **MVC**, **TypeScript**
(SAP-supported, transpiled by `ui5-tooling-transpile`), and tests in the standard `webapp/test/`
location. It uses a **single root Component** with a **layer-first** layout: every layer
(`controller/`, `view/`, `model/`, `service/`, `formatter/`, `config/`, `fragment/`, `css/`, `i18n/`)
is a top-level folder, with a `<module>/` subfolder inside each. The root manifest's router loads each
feature as an XML **View target** (no per-module sub-components).

## `webapp/` anatomy

```
webapp/
  index.html            Bootstrap page (loads sap-ui-core, points at index.ts)
  index.ts              TS bootstrap: mounts the root Component in a ComponentContainer
  Component.ts          The single root Component: owns the router + global models, async bootstrap,
                        and attaches each module's i18n bundle to its view on route-matched
  manifest.json         App descriptor: one router with a View target per feature (+ merged libs/css)

  controller/<module>/  Feature controllers (orchestration only — no business logic)
  view/<module>/        XML views
  model/<module>/       Per-feature JSON view-model(s)
  service/<module>/     The only layer that calls the backend (extends core BaseService → ApiClient)
  formatter/<module>/   value→UI5 state/icon mappings
  config/<module>/      declarative table/column/action config
  fragment/<module>/    reusable view fragments (where used)
  css/<module>/         per-feature styles (all registered in the root manifest's resources.css)
  i18n/i18n.properties  shell/root strings
  i18n/<module>/i18n.properties   per-feature strings (see i18n note below)

  core/                 Framework layer — no business logic (unchanged, cohesive)
    base/               BaseController / BaseComponent / BaseService
    services/           config, auth (session), theme, http (ApiClient), dialog, table
    formatters/ utils/ models/ constants/ types/ errors/ events/ logging/
  library/              Reusable custom controls (ConfigurableTable, InvestigationGrid, …) + fragments
  shell/                Global chrome: ToolPage shell, registry-driven navigation, notifications
    registry/ model/ navigation/ permissions/ favorites/ actions/ context/
  test/                 QUnit unit + OPA5 integration tests (SAP-standard location)
    testsuite.qunit.{html,js}
    unit/               unitTests.qunit.{html,js} + *.qunit.js
    integration/        opaTests.qunit.{html,js}
```

`core/`, `shell/`, and `library/` are the framework/chrome layers (not features), so they stay as
cohesive folders rather than being split across the top-level layer folders.

## A feature (module)

Each feature is a set of XML view(s) + controller(s) loaded directly by the root router, spread across
the layer folders under its `<module>/` subfolder. There is **no** per-module `Component.ts` or
`manifest.json` — routing, dependencies, and resources all live in the single root `manifest.json`.

**Layering rule:** `controller → service → ApiClient → backend`. The UI never calls SAP Integration
Suite directly; all traffic goes through the Node backend (`srv/`).

**View model:** each controller creates its own `"view"` JSON model in `onInit`
(`this.setModel(new <Module>Model(), "view")`) — the responsibility that a per-module Component held
in the previous layout.

## i18n

Each feature keeps its own bundle at `i18n/<module>/i18n.properties` (so keys like `title` don't
collide across features). On every route match, `Component.ts` attaches the matched module's bundle to
its view as a **view-scoped `i18n` model** (derived from the module id in the view name), and
`BaseController.getText` resolves against it. This keeps every existing `{i18n>key}` binding and
`getText("key")` call unchanged. The shell/root strings live in `i18n/i18n.properties` (the
component-level `i18n` model).

## Naming conventions

- Layer + module folders are **camelCase** (`controller/messageMonitoring/…`) so the UI5 namespace
  `…controller.messageMonitoring.List` maps straight to the path. (Backend module folders + REST
  routes are kebab-case.)
- Views/controllers are **PascalCase** and paired (`Dashboard.view.xml` ↔ `Dashboard.controller.ts`);
  a feature's root view is named in the router target (`view/<module>/<RootView>.view.xml`).
- Tests are `*.qunit.js` (plain JS loaded by the UI5 test runner — not part of the TS sources).

## Running

```bash
npm start --workspace=app          # ui5 serve on :8080 (proxies /api → :4004, live reload)
npm run ts-typecheck --workspace=app
npm run build --workspace=app      # ui5 build → dist/ (test/ excluded)
```

Tests run in the browser via the dev server: open
<http://localhost:8080/test/unit/unitTests.qunit.html> (unit) or
<http://localhost:8080/test/integration/opaTests.qunit.html> (OPA5). See
[`webapp/test/README.md`](webapp/test/README.md).

## Mock / offline development

This frontend has **no OData model** (`manifest.json` `dataSources` is empty); it uses `JSONModel` +
custom fetch services against the backend's `/api/v1`. So there is no `sap-fe-mockserver` /
`localService` OData mock. The real offline path is running the **backend in mock mode**
(`config/connectivity.json` → `mock`, backed by the SDK `MockEngine`), which serves realistic data
without a live SAP Integration Suite tenant.
