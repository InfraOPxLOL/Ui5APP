# `shell/landing/` — Landing (Home) Experience (§2, §9)

The user's **home** — not a dashboard, not monitoring. A visually rich, responsive launch page that
adapts to the current user, tenant, environment, permissions and favorites.

## Structure

| File | Purpose |
|---|---|
| `view/Home.view.xml` | The rich landing: hero (welcome, tenant/environment/health chips), system announcements, quick actions, favorite workspaces, available workspaces, recent workspaces & modules, footer branding. |
| `controller/Home.controller.ts` | Builds the `home` model from the framework services via the shared `ShellViewBuilder`; rebuilds on `context:changed`, `context:favoritesChanged`, `session:tenantChanged` and on every visit to the `home` route. Handles card presses, favorite toggles and quick-action dispatch. |
| `model/HomeModel.ts` | `HomeState` — the complete bindable state of the landing page. |

## What it shows (§2)

Welcome message · current tenant · current environment · health indicator · favorite workspaces ·
recent workspaces · quick actions · available workspaces · system announcements · application
version · company branding · theme information · recently visited modules.

## Landing cards (§9)

Each workspace card carries icon · title · description · status · module count · favorite toggle,
and only **authorized** cards appear (resolved by `NavigationService.getLandingWorkspaces`). Opening
a card navigates to the workspace's default route; the shell then activates the workspace, records
recents, and updates the sidebar and breadcrumbs — all without a page reload.

## Styling & accessibility

`css/shell.css` provides large cards with hover lift, fade-in animation and a gradient hero,
responsive down to phones, and honours `prefers-reduced-motion`. Health/announcement severities
reuse UI5 value states so they follow the active theme and high-contrast modes.

## Routing

The `home` route (`""` and `home` patterns) targets a **View** target (`Home.view.xml`) rendered
into the shared `moduleContainer`, so the landing behaves like any other page in the container.
