import { z } from "zod";

/**
 * Request validation schemas for the Certificate & Security Center module, applied at the route
 * boundary via `validateRequest` before any service runs.
 */

/** Path-parameter schema for endpoints keyed by a keystore entry alias. */
export const aliasParamSchema = z.object({
  alias: z.string().min(1),
});
