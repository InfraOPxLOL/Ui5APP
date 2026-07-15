import type { ISplunkProvider } from "../../core/providers/ISplunkProvider.js";
import type {
  ProviderContext,
  SplunkMessageEvent,
  SplunkPayloadBody,
  SplunkQueryHint,
} from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateSplunkHecEvent, type SplunkHecEvent } from "../mock/fixtures/index.js";
import { decodeGzipBase64Text } from "./SplunkPayloadCodec.js";

/** Mock implementation of {@link ISplunkProvider} (architecture: Provider Framework, §10). */
export class MockSplunkProvider implements ISplunkProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async getMessageEvent(
    context: ProviderContext,
    messageId: string,
    hint: SplunkQueryHint,
  ): Promise<SplunkMessageEvent | undefined> {
    const raw = await this.mockEngine.resolve<SplunkHecEvent | undefined>({
      operationKey: "splunk.getMessageEvent",
      tenantId: context.tenantId,
      generateSuccess: () => generateSplunkHecEvent(messageId, hint),
      generateEmpty: () => undefined,
    });
    return raw === undefined ? undefined : MockSplunkProvider.toDomain(messageId, raw);
  }

  private static toDomain(messageId: string, raw: SplunkHecEvent): SplunkMessageEvent {
    return {
      messageId,
      correlationId: raw.event.correlationId,
      requestPayload: MockSplunkProvider.toBody(
        raw.event.requestPayload,
        raw.event.requestPayloadMimeType,
        raw.event.requestPayloadCompression,
      ),
      responsePayload: MockSplunkProvider.toBody(
        raw.event.responsePayload,
        raw.event.responsePayloadMimeType,
        raw.event.responsePayloadCompression,
      ),
    };
  }

  private static toBody(
    gzipBase64: string,
    contentType: string,
    compression: string,
  ): SplunkPayloadBody | undefined {
    if (gzipBase64 === "") {
      return undefined;
    }
    try {
      const content = decodeGzipBase64Text(gzipBase64);
      return { content, contentType, sizeBytes: Buffer.byteLength(content, "utf8"), compression };
    } catch {
      // Malformed compressed data degrades to "unavailable" rather than failing the whole request —
      // matches this codebase's honest-degradation convention (e.g. `PayloadEngine.safeParseJson`).
      return undefined;
    }
  }
}
