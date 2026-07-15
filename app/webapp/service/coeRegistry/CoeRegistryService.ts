import BaseService from "../../core/base/BaseService";
import type { RegistryList, RegistryParameter, RegistryUpdate } from "./CoeRegistryTypes";

/**
 * Data service for the Global Partner Parameter Registry workspace (spec §2, Tile 3). Consumes
 * **only** `/api/v1/coe-registry`, composed from the Operations Engine's Partner Directory engine.
 */
export default class CoeRegistryService extends BaseService {
  public constructor() {
    super("/api/v1/coe-registry");
  }

  /**
   * Lists the parameters under a Partner ID.
   * @param pid the owning Partner ID.
   * @param signal optional abort signal.
   * @returns the parameters.
   */
  public async list(pid: string, signal?: AbortSignal): Promise<RegistryList> {
    return this.client.get<RegistryList>(this.path(), { query: { pid }, signal });
  }

  /**
   * Edits one parameter's value.
   * @param update the parameter to persist.
   * @returns the persisted parameter.
   */
  public async update(update: RegistryUpdate): Promise<RegistryParameter> {
    return this.client.put<RegistryParameter, RegistryUpdate>(this.path(), update);
  }

  /**
   * Deletes one parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id.
   */
  public async remove(pid: string, id: string): Promise<void> {
    await this.client.delete<void>(this.path(), { query: { pid, id } });
  }
}
