import { z } from "zod";

/**
 * Content-density modes. `auto` derives density from the device (touch → cozy, otherwise compact).
 */
export const COMPACT_MODES = ["auto", "compact", "cozy"] as const;

/** Union of the supported content-density modes. */
export type CompactMode = (typeof COMPACT_MODES)[number];

/**
 * Schema for `config/theme.json` — visual identity and theming.
 *
 * Properties:
 * - `defaultTheme`     — UI5 theme id applied at bootstrap (e.g. `sap_horizon`).
 * - `darkTheme`        — UI5 theme id used when a dark appearance is requested.
 * - `availableThemes`  — the closed set users may switch between when override is allowed.
 * - `allowUserOverride`— whether the (future) theme switcher is offered at all.
 * - `compactMode`      — one of {@link COMPACT_MODES}; content density policy.
 * - `accentColor`      — brand accent colour (hex) for custom-styled surfaces.
 * - `logo`             — app-relative path to the company logo asset ("" = no logo).
 * - `companyName`      — company name rendered in branded chrome.
 * - `applicationTitle` — display title of the application (branding text, distinct from the
 *                        technical `application.json` name).
 *
 * `defaultTheme` and `darkTheme` must be members of `availableThemes`; validated at boot.
 */
export const themeSchema = z
  .object({
    defaultTheme: z.string().min(1),
    darkTheme: z.string().min(1),
    availableThemes: z.array(z.string().min(1)).min(1),
    allowUserOverride: z.boolean().default(true),
    compactMode: z.enum(COMPACT_MODES).default("auto"),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB hex colour"),
    logo: z.string().default(""),
    companyName: z.string().min(1),
    applicationTitle: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    for (const [key, theme] of [
      ["defaultTheme", value.defaultTheme],
      ["darkTheme", value.darkTheme],
    ] as const) {
      if (!value.availableThemes.includes(theme)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} "${theme}" is not listed in availableThemes`,
          path: [key],
        });
      }
    }
  });

/** Typed view of `config/theme.json`. */
export type ThemeConfig = z.infer<typeof themeSchema>;
