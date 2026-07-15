import { z } from "zod";

/**
 * Request validation schemas for the Runtime Center module, applied at the route boundary via
 * `validateRequest` before any service runs.
 */

/** Path-parameter schema for endpoints keyed by a runtime artifact id. */
export const artifactIdParamSchema = z.object({
  artifactId: z.string().min(1),
});
