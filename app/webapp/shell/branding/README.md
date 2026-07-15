# `shell/branding/` — Branding (§17)

The one place branding is resolved, entirely from configuration — no logo, name, version, accent
colour or banner text is hardcoded in any view or controller.

## `BrandingService`

- `getBranding()` → `BrandingInfo`: application name/title, version, vendor, company name,
  application logo, company logo, accent colour, support contact, documentation URL (from
  `application.json` + `theme.json`).
- `getEnvironmentBanner()` → shown for non-production environments (`environment.json` `kind`) to
  prevent "wrong system" mistakes.
- `getTenantBanner()` → the identity chip (name/colour/icon) for the currently-selected tenant.
- `emptyBranding()` → a zeroed descriptor for pre-bootstrap binding.

## Configuration sources

| Branding item | Source |
|---|---|
| Application name, version, vendor, support, docs | `application.json` |
| Application title, company name, logo, accent | `theme.json` |
| Environment banner | `environment.json` |
| Tenant banner | selected tenant (`tenants.json`) |

Company logo currently mirrors the application logo — there is no separate company-logo key in
`theme.json` today; a dedicated key can be added to configuration later without changing consumers.
