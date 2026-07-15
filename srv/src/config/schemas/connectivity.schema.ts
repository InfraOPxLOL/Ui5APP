import { z } from "zod";

/**
 * The provider implementation a tenant is served by (architecture: Phase 5 — "The implementation
 * should be selected automatically through configuration"). `mock` keeps every Phase-4 behaviour
 * unchanged; `real` wires the same sub-clients to live Integration Suite connectivity instead.
 */
export const CONNECTIVITY_MODES = ["mock", "real"] as const;

/** Union of the supported connectivity modes. */
export type ConnectivityMode = (typeof CONNECTIVITY_MODES)[number];

/**
 * How destinations are discovered when `mode` is `real` (architecture: Destination Integration, §1).
 *
 * - `static` — destinations are assembled from `tenants.json` plus this file's `tenantAuth` entries;
 *   no BTP Destination service call is made. Suitable for direct/local testing against a tenant.
 * - `btp`    — destinations are looked up live from the bound SAP BTP Destination service, per
 *   tenant, by `tenants.json`'s `destinationName`. The recommended production setting.
 */
export const DESTINATION_DISCOVERY_MODES = ["static", "btp"] as const;

/** Union of the supported destination discovery modes. */
export type DestinationDiscoveryMode = (typeof DESTINATION_DISCOVERY_MODES)[number];

/** The authentication mechanisms selectable for a tenant under `static` destination discovery. */
export const TENANT_AUTH_TYPES = ["basic", "oauth-client-credentials"] as const;

/** Union of the supported static tenant authentication types. */
export type TenantAuthType = (typeof TENANT_AUTH_TYPES)[number];

/**
 * Schema for one `tenantAuth` entry — the non-secret authentication *strategy* for a tenant under
 * `static` destination discovery. Actual secrets (password, client secret) are never stored here;
 * they are read from environment variables named `CPI_<TENANTID>_<KEY>` by the SDK composition root
 * (architecture: Authentication Framework — "Credentials must come from configuration", read as: the
 * *strategy* is configuration, the *secret value* is environment-scoped, consistent with how every
 * other credential in this codebase is handled — see `config/env.ts`).
 *
 * Properties:
 * - `tenantId`      — the `tenants.json` tenant id this entry authenticates.
 * - `type`          — one of {@link TENANT_AUTH_TYPES}.
 * - `oauthTokenUrl` — required when `type` is `oauth-client-credentials`.
 * - `oauthScope`    — optional space-separated OAuth scope(s).
 */
export const tenantAuthSchema = z
  .object({
    tenantId: z.string().min(1),
    type: z.enum(TENANT_AUTH_TYPES),
    oauthTokenUrl: z.string().url().optional(),
    oauthScope: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "oauth-client-credentials" && value.oauthTokenUrl === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `tenantAuth entry for "${value.tenantId}": oauthTokenUrl is required when type is "oauth-client-credentials"`,
        path: ["oauthTokenUrl"],
      });
    }
  });

/**
 * Schema for `config/connectivity.json` — selects whether the Integration Suite SDK serves mock or
 * real data, and (when real) how destinations are discovered and tenants are authenticated.
 *
 * Properties:
 * - `mode`                — global default: {@link CONNECTIVITY_MODES}.
 * - `destinationDiscovery` — how destinations are discovered when `mode` is `real`.
 * - `tenantAuth`           — per-tenant auth strategy, consumed only under `static` discovery (a
 *                            `btp` lookup returns its own `Authentication` type from the destination
 *                            itself and ignores this list).
 */
export const connectivitySchema = z
  .object({
    mode: z.enum(CONNECTIVITY_MODES).default("mock"),
    destinationDiscovery: z.enum(DESTINATION_DISCOVERY_MODES).default("static"),
    tenantAuth: z.array(tenantAuthSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const entry of value.tenantAuth) {
      if (seen.has(entry.tenantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate tenantAuth entry for tenant id "${entry.tenantId}"`,
          path: ["tenantAuth"],
        });
      }
      seen.add(entry.tenantId);
    }
  });

/** Typed view of a single `tenantAuth` entry. */
export type TenantAuthConfig = z.infer<typeof tenantAuthSchema>;

/** Typed view of `config/connectivity.json`. */
export type ConnectivityConfig = z.infer<typeof connectivitySchema>;
