import type { PayloadClient } from "../../sdk/client/PayloadClient.js";
import type { PayloadEnvelope } from "../../core/providers/types.js";
import type { AttachmentSummary } from "../dto/AttachmentDto.js";
import { OperationsCache } from "../cache/index.js";
import { formatBytesHuman } from "../transform/index.js";

/**
 * Prepares payload attachment metadata (architecture: Phase 6, Attachment Engine, §8). Lists
 * attachment metadata only; content shaping for a single attachment is `PayloadEngine`'s job (the
 * two share `sdk.payload` but serve distinct responsibilities — list vs. format — so neither
 * duplicates the other's logic).
 */
export class AttachmentEngine {
  public constructor(
    private readonly client: PayloadClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Lists the attachments recorded for a message.
   * @param messageId the MPL message id.
   * @returns the attachment summaries; empty when the message recorded none.
   */
  public async listAttachments(messageId: string): Promise<readonly AttachmentSummary[]> {
    return this.cache.dedupe(`attachment.list:${messageId}`, async () => {
      const attachments = await this.client.listAttachments(messageId);
      return attachments.map(AttachmentEngine.toSummary);
    });
  }

  private static toSummary(attachment: Omit<PayloadEnvelope, "content">): AttachmentSummary {
    return {
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
      name: attachment.name,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      sizeHuman: formatBytesHuman(attachment.sizeBytes),
    };
  }
}
