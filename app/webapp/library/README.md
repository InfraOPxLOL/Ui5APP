# `library/` — reusable UI building blocks

Module-agnostic custom controls and fragments shared across the application. Like `core/`, this
layer contains **no business logic** and never imports from `modules/` or `shell/`.

## Controls

| Control | Purpose |
|---|---|
| `ConfigurableTable` | Config-driven table. Generates columns and cell templates from a `TableDefinition`, so modules describe tables as data rather than XML. |
| `StatusIndicator` | Renders an MPL/queue status with the correct semantic colour and icon (via `StatusFormatter`). |
| `SeverityBadge` | Renders an alert/health severity with the correct semantic colour (via `severityToValueState`). |

Each custom control ships a hand-written `*.gen.d.ts` companion declaring the TypeScript signatures
of the property accessors UI5 generates at runtime from the control's `metadata` (mirrors
`@ui5/ts-interface-generator`). Update the companion when a control's metadata changes.

## Fragments

| Fragment | Purpose |
|---|---|
| `ConfirmDialog` | Shared confirmation dialog for destructive actions. |
| `DetailPopover` | Shared row-detail popover (label/value pairs). |
| `ExportDialog` | Shared export format/scope chooser feeding `ExportHelper`. |
| `FilterBar` | Shared filter/search chrome; modules inject their own filter fields. |

Generic dialogs are opened through `core/services/dialog/DialogService`, never by bespoke
per-module dialog controllers.
