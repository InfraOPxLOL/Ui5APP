# `app/` — Frontend (SAP UI5 + TypeScript)

The UI5 frontend for the Integration Portal: a **single root Component** with a **layer-first** layout
(top-level `controller/`, `view/`, `model/`, `service/`, … each holding a `<module>/` subfolder). Built
with TypeScript (transpiled by `ui5-tooling-transpile`), XML views, and strict MVC. See
[`STRUCTURE.md`](STRUCTURE.md) for the full anatomy and the i18n/view-model conventions.

## Layout

| Path | Responsibility |
|---|---|
| `webapp/index.html` / `index.ts` | Bootstrap: mounts the root component. |
| `webapp/Component.ts` | The single root component: owns the router + global models, async bootstrap, per-route module i18n. |
| `webapp/manifest.json` | App descriptor: one router with a View target per feature (+ merged libs/css). |
| `webapp/{controller,view,model,service,formatter,config,fragment,css}/<module>/` | The feature layers, one `<module>/` subfolder per feature. |
| `webapp/i18n/` | Shell strings (`i18n.properties`) + per-feature bundles (`<module>/i18n.properties`). |
| `webapp/core/` | Framework layer (base classes, services, formatters, utils, errors, events). No business logic. |
| `webapp/library/` | Reusable custom controls (`ConfigurableTable`, `InvestigationGrid`, …) + fragments. |
| `webapp/shell/` | Global chrome: `ToolPage` shell, registry-driven side navigation, notification panel. |
| `webapp/test/` | QUnit unit tests + OPA5 integration tests (SAP-standard location). See [`webapp/test/README.md`](webapp/test/README.md). |

> **Folder-naming note:** frontend folders are camelCase (e.g. `controller/messageMonitoring/`) because
> UI5 resolves the namespace `…controller.messageMonitoring.List` directly to the path. Backend module
> folders and REST routes use kebab-case. `core/`, `shell/`, `library/` stay cohesive (framework layers).

## Layering rule

`controller → service → ApiClient`. Controllers hold no business logic — they read an event, call one
service method, and bind the result. Only services call `ApiClient`; the UI never calls Integration
Suite directly (all traffic goes through the backend). Each controller creates its own `"view"` model
in `onInit`.

## Adding a feature

1. Add its files under the layer folders: `controller/<id>/`, `view/<id>/`, `model/<id>/`,
   `service/<id>/`, plus `formatter/`/`config/`/`fragment/`/`css/`/`i18n/<id>/` as needed.
2. Add a route + a `type: View` target in `webapp/manifest.json` (name
   `…view.<id>.<RootView>`), and register any new `css/<id>/…` in `resources.css`.
3. Add one entry in `webapp/shell/model/ModuleRegistry.ts` and one `modules.<id>` key in
   `config/features.json`.

Nothing in `shell/` or `core/` needs to change.

## Scripts

```bash
npm run build --workspace=app         # ui5 build → dist/ (test/ excluded)
npm run start --workspace=app         # ui5 serve (local dev, proxies /api to :4004, live reload)
npm run ts-typecheck --workspace=app  # tsc --noEmit
```

**Tests** run in the browser via the dev server (SAP-standard UI5 test runner). With `npm start`
running:

- Unit tests: <http://localhost:8080/test/unit/unitTests.qunit.html>
- Integration (OPA5): <http://localhost:8080/test/integration/opaTests.qunit.html>
- Full suite: <http://localhost:8080/test/testsuite.qunit.html>

## Custom controls

Each custom control ships a hand-written `*.gen.d.ts` companion declaring the TypeScript signatures
of the property accessors UI5 generates at runtime from the control `metadata` (mirrors
`@ui5/ts-interface-generator`). Update the companion when a control's metadata changes.
