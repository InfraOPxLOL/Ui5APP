import type { ProviderContext, SplunkMessageEvent, SplunkQueryHint } from "./types.js";

/**
 * Fallback access to message payload data recovered from Splunk, for messages that recorded no MPL
 * attachments on the Integration Suite tenant itself (the common case on this trial tenant — see
 * `operations/engines/PayloadEngine.prepareFromSplunk`). Real Splunk search-API querying isn't
 * reachable from this trial account today, so only a mock implementation exists
 * (`sdk/providers/MockSplunkProvider.ts`); this interface is the seam a future `RealSplunkProvider`
 * would implement.
 */
export interface ISplunkProvider {
  /**
   * Looks up the Splunk-recorded event for one message.
   * @param context the tenant/correlation context.
   * @param messageId the MPL message id.
   * @param hint known fields of the message, used to correlate/scope the Splunk lookup.
   * @returns the recovered event, or `undefined` when Splunk has no matching record either.
   */
  getMessageEvent(
    context: ProviderContext,
    messageId: string,
    hint: SplunkQueryHint,
  ): Promise<SplunkMessageEvent | undefined>;
}
