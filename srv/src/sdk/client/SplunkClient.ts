import type { ISplunkProvider } from "../../core/providers/ISplunkProvider.js";
import type { SplunkMessageEvent, SplunkQueryHint } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Splunk payload-fallback sub-client (architecture: Payload fallback). Thin facade over
 * {@link ISplunkProvider} for `PayloadEngine.prepareFromSplunk`, mirroring `PayloadClient`'s shape.
 */
export class SplunkClient {
  public constructor(
    private readonly provider: ISplunkProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Looks up the Splunk-recorded event for one message. See {@link ISplunkProvider.getMessageEvent}. */
  public getMessageEvent(
    messageId: string,
    hint: SplunkQueryHint,
    context?: ClientCallContext,
  ): Promise<SplunkMessageEvent | undefined> {
    return this.provider.getMessageEvent(
      resolveContext(this.defaultTenantId, context),
      messageId,
      hint,
    );
  }
}
