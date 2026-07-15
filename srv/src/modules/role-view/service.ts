import type { RoleViewDto } from "./dto.js";
import { emptyPage, type PagedResult } from "../../core/http/pagination.js";
import type { PaginationQuery } from "../../core/http/pagination.js";

/**
 * Service for the Roles module. The only layer that talks to CPI (via the shared
 * {@link IntegrationSuiteClient}). It maps raw CPI payloads into the module DTOs so no upstream
 * shape leaks upward. Phase 1 methods return typed placeholder results.
 */
export class RoleViewService {
  /**
   * Retrieves a server-paginated page of Roles rows.
   * @param query validated paging/sorting/filtering parameters.
   * @returns a page of rows (Phase 1: empty).
   */
  public async list(query: PaginationQuery = {}): Promise<PagedResult<RoleViewDto>> {
    return Promise.resolve(emptyPage<RoleViewDto>(query.$top));
  }
}

/** Shared service instance. */
export const roleViewService = new RoleViewService();
