# Payload Studio (Phase 10)

A professional payload investigation environment for SAP Integration Suite middleware engineers —
closer to an IDE than a monitoring screen. **Always opened from the Message Investigation Workspace**
(never a sidebar/landing destination of its own).

## Architecture — consumes only the Operations Engine

```
Payload Studio (this module)
   ↓ HTTP: GET /api/v1/payload-studio/:messageId, GET …/attachments/:id/download
Payload Studio module (srv/src/modules/payload-studio)   ← composes the DTOs
   ↓
Operations Engine (srv/src/operations, Phase 6)   ← the only business layer
   ↓
Integration Suite SDK → SAP Integration Suite
```

The UI **never** talks to the SDK, never knows an Integration Suite endpoint — only the
`PayloadStudioData` DTO ([`service/PayloadStudioTypes.ts`](service/PayloadStudioTypes.ts)), fetched
through [`PayloadStudioService`](service/PayloadStudioService.ts).

## Getting here: the Message Investigation integration

Payload Studio is a genuine module (own `ModuleId`, route, `WorkspaceCatalog` entry) but is flagged
`showInSidebar: false` / `showLandingCard: false` — it never appears in navigation, yet remains a
fully permission-gated, addressable route (`RouteGuard` authorizes by permission independent of
sidebar/landing visibility). Message Investigation's "Open Payload" quick action
([`modules/messageMonitoring/config/investigationActions.ts`](../messageMonitoring/config/investigationActions.ts))
navigates here, encoding the source message id as deep-link query state via the existing
`DeepLinkHelper` (`payloadStudio:?query:` — an additive route-pattern change, the bare route name is
unchanged). "Open Message" navigates back the same way.

## Layout (§ Layout)

A resizable `sap.ui.layout.Splitter` arranges Payload Navigation (left) | Payload Editor (center) |
Metadata Panel (right), with an expandable bottom panel (Properties/Attachments/Headers/Validation).
Pane state is remembered for the session via [`PayloadLayoutService`](service/PayloadLayoutService.ts)
(in-memory, mirroring every other session-only service in this codebase).

## Payload Navigation (§ Payload Navigation)

Icon-driven left list ([`config/payloadNavigation.ts`](config/payloadNavigation.ts)): Request Payload
and Response Payload switch the center editor; Comparison switches it to side-by-side diff mode;
Attachments/Headers/Properties focus the corresponding bottom tab. **History** is a documented future
item — the domain model carries no payload-revision history for a message today (honest gap, not
fabricated). **Response Payload** is genuinely absent (not fabricated) unless a second attachment was
actually recorded for the message — see the backend DTO's own doc comment; today's mock provider
always records exactly one attachment.

## Payload Editor (§ Payload Editor)

Built on `sap.ui.codeeditor.CodeEditor` (an SAPUI5 library, wrapping Ace) — giving genuine syntax
highlighting, line numbers, code folding and word wrap natively, with `editable="false"` throughout
(this is an investigation tool; §Validation is explicit that this is read-only). Pretty/Raw/Tree view
modes are computed client-side from the already-fetched `PayloadView` (`formatted`/`raw`/`tree`).
**Find/Replace/Go-To-Line/Highlight-Matches**: Ace's own built-in keybindings (Ctrl+F, Ctrl+G) provide
these natively in the rendered editor; there is no stable, typed API surface in `@sapui5/types` for
`sap.ui.codeeditor.CodeEditor`'s internal Ace instance, so this workspace does not reimplement a
parallel (and necessarily weaker) find/goto mechanism — an honest scope boundary, not an omission.
Word wrap/theme/fullscreen are real, controller-driven toggles.

## Search (§ Search)

A dedicated toolbar (case-sensitive / whole-word / regex / match-count "N of M") backed by the new,
reusable [`core/utils/TextSearchUtils.ts`](../../core/utils/TextSearchUtils.ts) — computed over the
currently displayed payload text. XPath/JSONPath search are documented future capabilities.

## Request/Response Comparison (§ Request/Response Comparison)

[`service/PayloadCompareUtils.ts`](service/PayloadCompareUtils.ts) is a client-side, longest-common-
subsequence line diff (bounded — very large payloads report `truncated` rather than hanging the tab)
with an "ignore whitespace" toggle and a difference summary. Comparison **between two different
messages** is a documented future capability (§ Request/Response Comparison) — this phase compares one
message's own request against its own response.

## Metadata Panel & Payload Statistics (§ Metadata Panel, § Payload Statistics)

Metadata is composed server-side (`PayloadStudioService`, backend); `encoding`/`characterSet` are
derived from the payload's declared content type (UTF-8 assumed when undeclared, since the content is
already-decoded text); `compression` is honestly always `"none"` — the domain model carries no
transfer-compression indicator. Statistics (size/lines/characters/nodes/elements/attributes/arrays/
objects) are computed client-side by [`service/PayloadStatisticsUtils.ts`](service/PayloadStatisticsUtils.ts)
from the already-fetched payload — no extra round trip per view.

## Headers / Properties / Attachments (§ Headers, § Properties, § Attachments)

Headers and Properties reuse the **same** categorized headers bag (`HeaderSummary`) — the domain
model carries one headers/properties bag today, not the distinct Camel-header / exchange-property /
application-property namespaces a real tenant exposes (documented seam, matching Phase 9's Detail
Drawer). Attachments list name/type/size; preview/inline-image-preview are documented future items.

## Validation (§ Validation)

[`service/PayloadValidationUtils.ts`](service/PayloadValidationUtils.ts) is read-only: XML
well-formedness and JSON parseability reuse the existing `core/utils/XmlUtils`/`JsonUtils` (built for
exactly this purpose since Phase 1's scaffold), plus a basic invalid-control-character check. No
editing, ever.

## Quick Actions & Permissions (§ Quick Actions, § Permissions)

[`config/payloadQuickActions.ts`](config/payloadQuickActions.ts) — metadata-driven, dispatched
generically by `kind` (`copy` | `download` | `navigate` | `compare` | `future`), identical in spirit
to Message Investigation's own action framework. Workspace visibility requires `PI_PAYLOAD_VIEWER`;
**Download Payload** (an administrative action — exporting raw production payload bytes is more
sensitive than viewing a pretty-printed representation) requires `PI_PAYLOAD_ADMIN`. Both role
collections are declared in Phase 7's `RoleCollections.ts` roadmap catalogue — gating required no new
permission mechanism.

## Tests

- Backend: [`srv/test/unit/operations/payloadStudioModule.test.ts`](../../../../srv/test/unit/operations/payloadStudioModule.test.ts).
- Frontend: `TextSearchUtilsTest`, `PayloadCompareUtilsTest`, `PayloadStatisticsUtilsTest`,
  `PayloadValidationUtilsTest`, `PayloadStudioFormatterTest` (all in `webapp/test/unit/`).
