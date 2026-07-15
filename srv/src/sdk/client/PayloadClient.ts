import type { IPayloadProvider } from "../../core/providers/IPayloadProvider.js";
import type { PayloadEnvelope } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Payload sub-client (architecture: Integration Suite Client, §4 — `PayloadClient`). Thin facade
 * over {@link IPayloadProvider} for the future Payload Viewer/Archive modules.
 */
export class PayloadClient {
  public constructor(
    private readonly provider: IPayloadProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Lists attachment metadata for a message. See {@link IPayloadProvider.listAttachments}. */
  public listAttachments(
    messageId: string,
    context?: ClientCallContext,
  ): Promise<readonly Omit<PayloadEnvelope, "content">[]> {
    return this.provider.listAttachments(resolveContext(this.defaultTenantId, context), messageId);
  }

  /** Reads one attachment including content. See {@link IPayloadProvider.getAttachment}. */
  public getAttachment(
    messageId: string,
    attachmentId: string,
    context?: ClientCallContext,
  ): Promise<PayloadEnvelope | undefined> {
    return this.provider.getAttachment(
      resolveContext(this.defaultTenantId, context),
      messageId,
      attachmentId,
    );
  }
}
