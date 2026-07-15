# `core/models/` — global application models

Reusable, typed `JSONModel` subclasses owned by the root `Component` and available to every view
under fixed model names. They are binding surfaces: population happens once during bootstrap (from
the ConfigService/SessionService); mutation goes through their typed methods, never via raw
`setProperty` from module code.

| Model | Name | State | Populated from |
|---|---|---|---|
| `ApplicationModel` | `app` | identity, branding, environment, `ready` | `application.json`, `environment.json`, `theme.json` |
| `ConfigurationModel` | `configState` | full config snapshot (one-way) | the loaded `AppConfig` |
| `ThemeModel` | `theme` | active/default/dark theme, density, accent | `theme.json` + ThemeService |
| `UserModel` | `user` | id, name, email, scopes, `authenticated` | `GET /session/me` |
| `TenantModel` | `tenant` | tenants, selected tenant (+ `selectTenant()` → publishes `session:tenantChanged`) | `tenants.json` projection |
| `NotificationModel` | `notifications` | capped item list, unread count (+ `add`/`markAllRead`) | Alert Center (later phase) |

The pre-existing `global` model remains the shell-chrome binding surface (busy/bootstrapped and
legacy header fields); shell bindings migrate to these models in a later phase.

All models carry the `@namespace` JSDoc tag (convention 4a) and are instantiated inside
`Component.init()` — never as field initializers (convention 4b).
