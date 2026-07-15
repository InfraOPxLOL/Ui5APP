import { z } from "zod";

/**
 * Schema for a single Integration Suite tenant entry in `config/tenants.json`.
 *
 * Properties:
 * - `id`              — stable tenant identifier used in API calls (`?tenantId=`).
 * - `name`            — display name rendered in the (future) tenant switcher.
 * - `description`     — free-text purpose of the tenant.
 * - `destinationName` — BTP Destination resolved at runtime for credentials. Secrets never live
 *                       in configuration; this is the pointer to where they do live.
 * - `baseUrl`         — tenant API base URL. Used only by the Phase-1 placeholder destination
 *                       resolver until the Destination service is wired; the Destination's own URL
 *                       then takes precedence.
 * - `region`          — BTP region identifier (e.g. `us10-001`, `eu10`).
 * - `environment`     — environment `name` this tenant belongs to (see environment.json).
 * - `enabled`         — disabled tenants are hidden from the UI and rejected by the API.
 * - `displayColor`    — hex accent colour identifying the tenant in the UI.
 * - `displayIcon`     — SAP icon URI identifying the tenant in the UI.
 * - `refreshProfile`  — name of the refresh profile (refresh.json) this tenant uses.
 * - `default`         — exactly one tenant should be the default used when no id is given.
 */
export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  destinationName: z.string().min(1),
  baseUrl: z.string().url(),
  region: z.string().min(1),
  environment: z.string().min(1),
  enabled: z.boolean().default(true),
  displayColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB hex colour"),
  displayIcon: z.string().startsWith("sap-icon://"),
  refreshProfile: z.string().min(1),
  default: z.boolean().default(false),
});

/**
 * Schema for `config/tenants.json`. Requires at least one tenant and refuses duplicate ids so a
 * misconfigured file fails at boot rather than resolving the wrong tenant at request time.
 */
export const tenantsSchema = z
  .object({
    tenants: z.array(tenantSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const tenant of value.tenants) {
      if (ids.has(tenant.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate tenant id "${tenant.id}"`,
          path: ["tenants"],
        });
      }
      ids.add(tenant.id);
    }
    if (!value.tenants.some((tenant) => tenant.default && tenant.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one enabled tenant must be marked as default",
        path: ["tenants"],
      });
    }
  });

/** Typed view of a single tenant entry. */
export type TenantConfig = z.infer<typeof tenantSchema>;

/** Typed view of `config/tenants.json`. */
export type TenantsConfig = z.infer<typeof tenantsSchema>;
