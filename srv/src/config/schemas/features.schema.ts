import { z } from "zod";

/**
 * Schema for one module toggle. An object (not a bare boolean) so future per-module settings
 * (e.g. rollout percentage, required plan) can be added without changing every entry.
 */
export const moduleToggleSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Schema for `config/features.json` — module enablement and cross-cutting feature flags.
 *
 * Properties:
 * - `modules` — map of module id → toggle. Keys match the frontend `ModuleId` union and the
 *               module folder names; the sidebar hides disabled modules. New modules are added
 *               here without code changes to the shell.
 * - `flags`   — map of free-form feature-flag name → boolean, for behaviour toggles that are not
 *               whole modules (e.g. `enableWebSocketLiveFeed`).
 */
export const featuresSchema = z.object({
  modules: z.record(z.string(), moduleToggleSchema),
  flags: z.record(z.string(), z.boolean()).default({}),
});

/** Typed view of a single module toggle. */
export type ModuleToggle = z.infer<typeof moduleToggleSchema>;

/** Typed view of `config/features.json`. */
export type FeaturesConfig = z.infer<typeof featuresSchema>;
