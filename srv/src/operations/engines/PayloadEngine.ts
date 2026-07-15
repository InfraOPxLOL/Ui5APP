import type { PayloadClient } from "../../sdk/client/PayloadClient.js";
import type { SplunkClient } from "../../sdk/client/SplunkClient.js";
import type {
  PayloadEnvelope,
  SplunkPayloadBody,
  SplunkQueryHint,
} from "../../core/providers/types.js";
import type { PayloadDownloadModel, PayloadFormat, PayloadSummary } from "../dto/PayloadDto.js";
import { OperationsCache } from "../cache/index.js";
import { formatBytesHuman } from "../transform/index.js";

const OPENING_TAG_ONLY = /^<[^/!?][^>]*[^/]>$/;
const CLOSING_TAG = /^<\//;

/** Result of a Splunk-backed payload fallback lookup (see {@link PayloadEngine.prepareFromSplunk}). */
export interface SplunkPayloadResult {
  readonly requestPayload: PayloadSummary | undefined;
  readonly responsePayload: PayloadSummary | undefined;
}

/**
 * Prepares payload content for a future UI (architecture: Phase 6, Payload Engine, §7) — raw text,
 * pretty-printed text, a parsed tree for JSON, and a download model. No rendering happens here (no
 * UI); every method returns data, never markup.
 */
export class PayloadEngine {
  public constructor(
    private readonly client: PayloadClient,
    private readonly splunkClient: SplunkClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Prepares every view of one payload's content.
   * @param messageId the MPL message id.
   * @param attachmentId the attachment to prepare.
   * @returns the prepared payload summary, or `undefined` when the attachment is unknown.
   */
  public async preparePayload(
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadSummary | undefined> {
    return this.cache.dedupe(`payload.prepare:${messageId}:${attachmentId}`, async () => {
      const envelope = await this.client.getAttachment(messageId, attachmentId);
      return envelope === undefined ? undefined : PayloadEngine.toSummary(envelope);
    });
  }

  /**
   * Prepares a ready-to-download model for one payload.
   * @param messageId the MPL message id.
   * @param attachmentId the attachment to prepare.
   * @returns the download model, or `undefined` when the attachment is unknown.
   */
  public async toDownloadModel(
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadDownloadModel | undefined> {
    const envelope = await this.client.getAttachment(messageId, attachmentId);
    if (envelope === undefined) {
      return undefined;
    }
    const format = PayloadEngine.detectFormat(envelope.contentType);
    const contentBase64 =
      format === "binary"
        ? envelope.content
        : Buffer.from(envelope.content, "utf8").toString("base64");
    return { fileName: envelope.name, mimeType: envelope.contentType, contentBase64 };
  }

  /**
   * Falls back to Splunk for request/response payload content, for messages that recorded no MPL
   * attachments on the tenant itself (the common case on this trial tenant). Only ever called after
   * `AttachmentEngine.listAttachments` has already come back empty — this method never itself
   * decides whether the fallback should fire (see `modules/payload-studio/service.ts`).
   * @param messageId the MPL message id.
   * @param hint known fields of the message, used to correlate the Splunk lookup.
   * @returns the recovered request/response payload summaries; either (or both) may be `undefined`
   *   when Splunk has no matching record — never fabricated.
   */
  public async prepareFromSplunk(
    messageId: string,
    hint: SplunkQueryHint,
  ): Promise<SplunkPayloadResult> {
    return this.cache.dedupe(`payload.splunk:${messageId}`, async () => {
      const event = await this.splunkClient.getMessageEvent(messageId, hint);
      return {
        requestPayload: PayloadEngine.toSummaryFromSplunkBody(
          messageId,
          "splunk-request",
          "request-payload",
          event?.requestPayload,
        ),
        responsePayload: PayloadEngine.toSummaryFromSplunkBody(
          messageId,
          "splunk-response",
          "response-payload",
          event?.responsePayload,
        ),
      };
    });
  }

  private static toSummaryFromSplunkBody(
    messageId: string,
    attachmentId: string,
    name: string,
    body: SplunkPayloadBody | undefined,
  ): PayloadSummary | undefined {
    if (body === undefined) {
      return undefined;
    }
    return PayloadEngine.toSummary({
      messageId,
      attachmentId,
      name,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      content: body.content,
    });
  }

  private static toSummary(envelope: PayloadEnvelope): PayloadSummary {
    const format = PayloadEngine.detectFormat(envelope.contentType);
    const raw = envelope.content;
    const formatted =
      format === "json"
        ? PayloadEngine.prettyJson(raw)
        : format === "xml"
          ? PayloadEngine.prettyXml(raw)
          : raw;
    return {
      messageId: envelope.messageId,
      attachmentId: envelope.attachmentId,
      name: envelope.name,
      contentType: envelope.contentType,
      format,
      raw,
      formatted,
      tree: format === "json" ? PayloadEngine.safeParseJson(raw) : undefined,
      sizeBytes: envelope.sizeBytes,
      sizeHuman: formatBytesHuman(envelope.sizeBytes),
    };
  }

  private static detectFormat(contentType: string): PayloadFormat {
    const normalized = contentType.toLowerCase();
    if (normalized.includes("json")) {
      return "json";
    }
    if (normalized.includes("xml")) {
      return "xml";
    }
    if (normalized.startsWith("text/")) {
      return "text";
    }
    return "binary";
  }

  private static safeParseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private static prettyJson(raw: string): string {
    const parsed = PayloadEngine.safeParseJson(raw);
    return parsed === undefined ? raw : JSON.stringify(parsed, null, 2);
  }

  /**
   * A dependency-free, best-effort XML indenter — not a general-purpose XML formatter (the same
   * honest scoping as `ODataMetadataParser`'s regex-based metadata extraction). Handles the common
   * case (one element per line, no mixed inline text/element content) correctly; deeply mixed
   * content renders unindented but never throws.
   */
  private static prettyXml(raw: string): string {
    const withBreaks = raw.replace(/>\s*</g, ">\n<").trim();
    if (withBreaks === "") {
      return raw;
    }
    let depth = 0;
    const indented: string[] = [];
    for (const line of withBreaks.split("\n")) {
      const isClosing = CLOSING_TAG.test(line);
      const opensWithoutClosing = OPENING_TAG_ONLY.test(line) && !isClosing;
      if (isClosing && depth > 0) {
        depth -= 1;
      }
      indented.push("  ".repeat(depth) + line);
      if (opensWithoutClosing) {
        depth += 1;
      }
    }
    return indented.join("\n");
  }
}
