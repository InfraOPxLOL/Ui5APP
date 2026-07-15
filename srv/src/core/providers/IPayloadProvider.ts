import type { PayloadEnvelope, ProviderContext } from "./types.js";

/**
 * Access to stored message payloads/attachments on an Integration Suite tenant.
 *
 * Backing the future Payload Viewer and Payload Archive modules. Payloads are fetched live per
 * request and never persisted by the platform (stateless-backend constraint); implementations
 * must enforce the caller's authorization before returning content.
 */
export interface IPayloadProvider {
  /**
   * Lists the payload attachments recorded for a message (metadata only, no content).
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @returns attachment metadata; empty when the message recorded no payloads.
   */
  listAttachments(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly Omit<PayloadEnvelope, "content">[]>;

  /**
   * Reads one payload attachment including its content.
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @param attachmentId the attachment to read.
   * @returns the payload envelope, or `undefined` when unknown.
   */
  getAttachment(
    context: ProviderContext,
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadEnvelope | undefined>;
}
