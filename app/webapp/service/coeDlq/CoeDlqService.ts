import BaseService from "../../core/base/BaseService";
import type { DlqMessageList, DlqRecovery, DlqReplayResult } from "./CoeDlqTypes";

/**
 * Data service for the DLQ & Intelligent Recovery Dashboard workspace (spec §6, Tile 4). Consumes
 * **only** `/api/v1/coe-dlq`, composed from the Operations Engine (MPL monitoring + Partner
 * Directory queue resolution).
 */
export default class CoeDlqService extends BaseService {
  public constructor() {
    super("/api/v1/coe-dlq");
  }

  /**
   * Lists failed messages (the master list).
   * @param signal optional abort signal.
   * @returns the failed-message rows.
   */
  public async listFailed(signal?: AbortSignal): Promise<DlqMessageList> {
    return this.client.get<DlqMessageList>(this.path(), { signal });
  }

  /**
   * Loads the recovery context (queue resolution + error details) for one message.
   * @param messageId the message id.
   * @param signal optional abort signal.
   * @returns the recovery context.
   */
  public async getRecovery(messageId: string, signal?: AbortSignal): Promise<DlqRecovery> {
    return this.client.get<DlqRecovery>(this.path(`${encodeURIComponent(messageId)}/recovery`), {
      signal,
    });
  }

  /**
   * Attempts a replay of one message (resolves its target queue).
   * @param messageId the message id.
   * @returns the replay result.
   */
  public async replay(messageId: string): Promise<DlqReplayResult> {
    return this.client.post<DlqReplayResult>(this.path(`${encodeURIComponent(messageId)}/replay`));
  }
}
