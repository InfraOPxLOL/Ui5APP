import type { IPayloadProvider } from "../../core/providers/IPayloadProvider.js";
import type { PayloadEnvelope, ProviderContext } from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generatePayloadAttachments } from "../mock/fixtures/index.js";

/** Mock implementation of {@link IPayloadProvider} (architecture: Provider Framework, §10). */
export class MockPayloadProvider implements IPayloadProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async listAttachments(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly Omit<PayloadEnvelope, "content">[]> {
    const attachments = await this.mockEngine.resolve({
      operationKey: "payload.listAttachments",
      tenantId: context.tenantId,
      generateSuccess: () => generatePayloadAttachments(messageId, 1),
      generateEmpty: () => [],
    });
    return attachments.map(({ content: _content, ...metadata }) => metadata);
  }

  /** @inheritdoc */
  public async getAttachment(
    context: ProviderContext,
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadEnvelope | undefined> {
    const attachments = await this.mockEngine.resolve({
      operationKey: "payload.getAttachment",
      tenantId: context.tenantId,
      generateSuccess: () => generatePayloadAttachments(messageId, 1),
    });
    // Generated attachment ids are opaque random hex a caller cannot predict ahead of a listing
    // call; fall back to the first generated attachment so any id round-tripped from
    // listAttachments() resolves, matching how a real store would behave for a real id.
    return (
      attachments.find((attachment) => attachment.attachmentId === attachmentId) ?? attachments[0]
    );
  }
}
