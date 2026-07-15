import { z } from "zod";

/** Valid landscape environments (spec §3 — "Must drop down exactly to: PRD, QAS, DEV"). */
export const COE_ENVIRONMENTS = ["PRD", "QAS", "DEV"] as const;

/** Pragmatic email pattern for the global support mailbox (spec §3 — "valid email routing"). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Body schema for `PUT /api/v1/coe-admin` — enforces every rule from spec §3 at the API boundary:
 * environment ∈ {PRD,QAS,DEV}; retries an integer 1–10; a valid email; an egress path beginning
 * with a forward slash.
 */
export const coeGlobalSettingsUpdateSchema = z.object({
  environment: z.enum(COE_ENVIRONMENTS),
  defaultRetries: z.number().int().min(1).max(10),
  defaultExceptionTo: z.string().regex(EMAIL_PATTERN, "Must be a valid email address."),
  defaultEgressUri: z.string().regex(/^\//, "Must begin with a forward slash."),
});
