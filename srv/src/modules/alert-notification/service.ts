import type { AlertNotificationDto } from "./dto.js";
import { emptyPage, type PagedResult } from "../../core/http/pagination.js";
import type { PaginationQuery } from "../../core/http/pagination.js";

/**
 * Service for the Alerts module. The only layer that talks to CPI (via the shared
 * {@link IntegrationSuiteClient}). It maps raw CPI payloads into the module DTOs so no upstream
 * shape leaks upward. Phase 1 methods return typed placeholder results.
 */
export class AlertNotificationService {
  /**
   * Retrieves a server-paginated page of Alerts rows.
   * @param query validated paging/sorting/filtering parameters.
   * @returns a page of rows (Phase 1: empty).
   */
  public async list(query: PaginationQuery = {}): Promise<PagedResult<AlertNotificationDto>> {
    return Promise.resolve(emptyPage<AlertNotificationDto>(query.$top));
  }
}

/** Shared service instance. */
export const alertNotificationService = new AlertNotificationService();
