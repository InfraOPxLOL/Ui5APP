import { z } from "zod";

/**
 * Standard server-paginated result envelope returned by every list endpoint. Mirrors the frontend
 * `PagedResult<T>` so the contract is identical on both sides.
 */
export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly skip: number;
  readonly top: number;
}

/**
 * Builds an empty page. Used by Phase 1 placeholder service implementations so every list endpoint
 * returns a valid, typed envelope before its upstream CPI call is implemented.
 * @param top the page size echoed back (defaults to 50).
 * @returns an empty paged result.
 */
export function emptyPage<T>(top = 50): PagedResult<T> {
  return { items: [], total: 0, skip: 0, top };
}

/**
 * Shared validation schema for list query parameters (paging, sorting, filtering). Coerces the
 * numeric paging params and applies safe bounds.
 */
export const paginationQuerySchema = z.object({
  $skip: z.coerce.number().int().min(0).optional(),
  $top: z.coerce.number().int().min(1).max(500).optional(),
  $orderby: z.string().optional(),
  $filter: z.string().optional(),
});

/** Parsed and validated list query parameters. */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
