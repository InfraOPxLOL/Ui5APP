import BaseService from "../../core/base/BaseService";
import type { CoeGlobalSettings, CoeGlobalSettingsUpdate } from "./CoeAdminTypes";

/**
 * Data service for the CoE Admin workspace (spec §3 — Global Framework Configurations). Consumes
 * **only** `/api/v1/coe-admin`, which the backend composes from the Operations Engine's Partner
 * Directory engine — the workspace never talks to the SDK, never knows an Integration Suite
 * endpoint, and only ever handles CoE DTOs.
 */
export default class CoeAdminService extends BaseService {
  public constructor() {
    super("/api/v1/coe-admin");
  }

  /**
   * Loads the current global framework settings.
   * @param signal optional abort signal.
   * @returns the four settings (fields `undefined` when not yet set on the tenant).
   */
  public async getGlobalSettings(signal?: AbortSignal): Promise<CoeGlobalSettings> {
    return this.client.get<CoeGlobalSettings>(this.path(), { signal });
  }

  /**
   * Persists the global framework settings.
   * @param update the validated settings to publish.
   * @returns the settings as read back from the tenant after the write.
   */
  public async saveGlobalSettings(update: CoeGlobalSettingsUpdate): Promise<CoeGlobalSettings> {
    return this.client.put<CoeGlobalSettings, CoeGlobalSettingsUpdate>(this.path(), update);
  }
}
