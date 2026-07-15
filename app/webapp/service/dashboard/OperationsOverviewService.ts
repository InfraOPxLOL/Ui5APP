import BaseService from "../../core/base/BaseService";
import type { OperationsOverview, OperationsSearchResponse } from "./OperationsTypes";

/**
 * Data service for the Operations Workspace. Consumes **only** `/api/v1/operations`, which the
 * backend composes entirely from the Operations Engine — so the workspace never talks to the SDK,
 * never knows an Integration Suite endpoint, and only ever handles Operations DTOs (architecture:
 * UI → Operations Engine → SDK → Integration Suite).
 */
export default class OperationsOverviewService extends BaseService {
  public constructor() {
    super("/api/v1/operations");
  }

  /**
   * Loads the aggregated Operations Overview in one round trip.
   * @param windowHours optional statistics window in hours (backend default: 24).
   * @param signal optional abort signal for superseded refreshes.
   * @returns the composed overview.
   */
  public async getOverview(
    windowHours?: number,
    signal?: AbortSignal,
  ): Promise<OperationsOverview> {
    return this.client.get<OperationsOverview>(this.path("overview"), {
      query: windowHours === undefined ? undefined : { windowHours },
      signal,
    });
  }

  /**
   * Runs the aggregated workspace search across every operational domain.
   * @param query the raw search term.
   * @param signal optional abort signal for superseded searches.
   * @returns the aggregated matches.
   */
  public async search(query: string, signal?: AbortSignal): Promise<OperationsSearchResponse> {
    return this.client.get<OperationsSearchResponse>(this.path("search"), {
      query: { q: query },
      signal,
    });
  }
}
