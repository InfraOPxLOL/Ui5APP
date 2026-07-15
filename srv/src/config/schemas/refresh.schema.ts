import { z } from "zod";

/**
 * Schema for one refresh profile: a named map of polling intervals (milliseconds) per concern.
 * Keys are open-ended so future modules add their interval without a schema change; every value
 * must be a sane positive interval (≥ 1s) so a typo cannot melt the backend with a 1 ms poll.
 */
export const refreshProfileSchema = z.record(z.string(), z.number().int().min(1000));

/**
 * Schema for `config/refresh.json` — named polling cadence profiles.
 *
 * Properties:
 * - `defaultProfile` — the profile applied when a tenant/module does not name one explicitly.
 * - `profiles`       — map of profile name → interval map. Well-known interval keys used by the
 *                      current modules: `dashboardMs`, `liveMonitoringMs`, `messageMonitoringMs`,
 *                      `jmsQueueMs`, `certificatesMs`, `analyticsMs`, `alertCenterMs`.
 *
 * The `defaultProfile` must exist in `profiles`; validated at boot.
 */
export const refreshSchema = z
  .object({
    defaultProfile: z.string().min(1),
    profiles: z.record(z.string(), refreshProfileSchema),
  })
  .superRefine((value, ctx) => {
    if (!(value.defaultProfile in value.profiles)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `defaultProfile "${value.defaultProfile}" is not declared in profiles`,
        path: ["defaultProfile"],
      });
    }
  });

/** Typed view of a single refresh profile (interval key → milliseconds). */
export type RefreshProfile = z.infer<typeof refreshProfileSchema>;

/** Typed view of `config/refresh.json`. */
export type RefreshConfig = z.infer<typeof refreshSchema>;
