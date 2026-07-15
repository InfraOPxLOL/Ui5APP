import { z } from "zod";

/**
 * Schema for `config/application.json` — static application identity metadata.
 *
 * Properties:
 * - `id`               — stable technical identifier (kebab-case, matches the MTA ID).
 * - `name`             — human-readable application name.
 * - `version`          — semantic version of the deployed configuration set.
 * - `description`      — one-line purpose statement.
 * - `vendor`           — owning organization.
 * - `supportContact`   — mailbox or channel users contact for support.
 * - `documentationUrl` — entry point to the product documentation.
 */
export const applicationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "must be a semantic version (x.y.z)"),
  description: z.string().min(1),
  vendor: z.string().min(1),
  supportContact: z.string().min(1),
  documentationUrl: z.string().url().or(z.literal("")),
});

/** Typed view of `config/application.json`. */
export type ApplicationConfig = z.infer<typeof applicationSchema>;
