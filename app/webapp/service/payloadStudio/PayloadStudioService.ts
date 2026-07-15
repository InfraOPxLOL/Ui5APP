import BaseService from "../../core/base/BaseService";
import DownloadUtils from "../../core/utils/DownloadUtils";
import type { PayloadStudioData } from "./PayloadStudioTypes";

/**
 * Data service for Payload Studio. Consumes **only** `/api/v1/payload-studio`, which the backend
 * composes entirely from the Operations Engine — the workspace never talks to the SDK, never knows
 * an Integration Suite endpoint, and only ever handles Operations DTOs (architecture: UI → Operations
 * Engine → SDK → Integration Suite).
 */
export default class PayloadStudioService extends BaseService {
  public constructor() {
    super("/api/v1/payload-studio");
  }

  /**
   * Loads the full Payload Studio payload for a message.
   * @param messageId the message id.
   * @param signal optional abort signal.
   * @returns the composed payload.
   */
  public async getStudio(messageId: string, signal?: AbortSignal): Promise<PayloadStudioData> {
    return this.client.get<PayloadStudioData>(this.path(encodeURIComponent(messageId)), { signal });
  }

  /**
   * Downloads one attachment (§ Quick Actions — "Download Payload").
   * @param messageId the message id.
   * @param attachmentId the attachment to download.
   * @param fileName the file name to save as (already known client-side from the attachment listing).
   */
  public async downloadAttachment(
    messageId: string,
    attachmentId: string,
    fileName: string,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/payload-studio/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
      { credentials: "same-origin" },
    );
    const blob = await response.blob();
    DownloadUtils.downloadBlob(blob, fileName);
  }
}
