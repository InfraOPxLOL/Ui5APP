import { paginationQuerySchema } from "../../core/http/pagination.js";

/**
 * Request validation schemas for the Analytics module. Applied at the route boundary via
 * `validateRequest` before any service runs.
 */

/** Query schema for the list endpoint (paging/sorting/filtering). */
export const listQuerySchema = paginationQuerySchema;
