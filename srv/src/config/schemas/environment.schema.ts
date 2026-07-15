import { z } from "zod";

/**
 * The known environment kinds. Behavioural switches (verbose errors, relaxed CORS, …) key off the
 * `kind`, never off the free-form `name`. Adding a future environment kind is a one-line change
 * here; every consumer that switches on `EnvironmentKind` is then checked by the compiler.
 */
export const ENVIRONMENT_KINDS = ["development", "testing", "production"] as const;

/** Union of the known environment kinds. */
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

/**
 * Schema for `config/environment.json` — which deployment stage this configuration set describes.
 *
 * Properties:
 * - `name`  — short stage identifier shown in logs and URLs (e.g. `dev`, `qa2`, `prod-eu`).
 *             Free-form so any number of stages can exist per kind.
 * - `label` — human-readable stage label rendered in the shell header.
 * - `kind`  — one of {@link ENVIRONMENT_KINDS}; drives environment-dependent behaviour.
 */
export const environmentSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(ENVIRONMENT_KINDS),
});

/** Typed view of `config/environment.json`. */
export type EnvironmentConfig = z.infer<typeof environmentSchema>;
