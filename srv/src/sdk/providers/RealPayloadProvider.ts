import type { IPayloadProvider } from "../../core/providers/IPayloadProvider.js";
import type { PayloadEnvelope, ProviderContext } from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Raw shape of one `MessageProcessingLogAttachments` entity. */
interface CpiAttachment {
  readonly AttachmentId: string;
  readonly Name: string;
  readonly ContentType: string;
  readonly ContentLength?: number;
}

/** Content-type prefixes/values downloaded as UTF-8 text rather than base64 — matches {@link PayloadEnvelope.content}'s documented contract ("the payload body as text; binary payloads are base64-encoded"). */
const TEXT_CONTENT_TYPES = [
  "text/",
  "application/xml",
  "application/json",
  "application/soap+xml",
  "application/xhtml+xml",
];

function isTextContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return TEXT_CONTENT_TYPES.some((candidate) => normalized.startsWith(candidate));
}

/**
 * Live implementation of {@link IPayloadProvider}, backed by SAP Integration Suite's documented
 * `MessageProcessingLogs('id')/Attachments` navigation and the `MessageProcessingLogAttachments`
 * entity set's `$value` binary stream (architecture: Payload Provider, §7). Text content types
 * (XML/JSON/plain text — the common case for integration payloads) are decoded as UTF-8 text;
 * genuinely binary content types are base64-encoded — matching {@link PayloadEnvelope.content}'s
 * documented contract exactly (and `MockPayloadProvider`'s fixture behaviour, so callers see the
 * same shape from either implementation).
 */
export class RealPayloadProvider implements IPayloadProvider {
  private readonly odataClient: ODataClient;
  private readonly restClient: SdkRestClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async listAttachments(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly Omit<PayloadEnvelope, "content">[]> {
    return this.pipeline.run({
      operationName: "payload.listAttachments",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const items = await this.odataClient.queryAllPages<CpiAttachment>(
          `${tenant.baseUrl}/MessageProcessingLogs(${toODataV2KeyLiteral(messageId)})/Attachments`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return items.map((raw) => RealPayloadProvider.toMetadata(messageId, raw));
      },
    });
  }

  /** @inheritdoc */
  public async getAttachment(
    context: ProviderContext,
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadEnvelope | undefined> {
    return this.pipeline.run({
      operationName: "payload.getAttachment",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const entityUrl = `${tenant.baseUrl}/MessageProcessingLogAttachments(${toODataV2KeyLiteral(attachmentId)})`;
        const metadata = await this.odataClient.getEntity<CpiAttachment>(
          entityUrl,
          tenant,
          opContext,
        );
        if (metadata === undefined) {
          return undefined;
        }
        const binary = await this.restClient.getBinary(`${entityUrl}/$value`, opContext, {
          headers: tenant.headers,
        });
        const content = isTextContentType(metadata.ContentType)
          ? Buffer.from(binary.data).toString("utf8")
          : Buffer.from(binary.data).toString("base64");
        return {
          messageId,
          attachmentId,
          name: metadata.Name,
          contentType: metadata.ContentType,
          sizeBytes: metadata.ContentLength,
          content,
        };
      },
    });
  }

  private static toMetadata(
    messageId: string,
    raw: CpiAttachment,
  ): Omit<PayloadEnvelope, "content"> {
    return {
      messageId,
      attachmentId: raw.AttachmentId,
      name: raw.Name,
      contentType: raw.ContentType,
      sizeBytes: raw.ContentLength,
    };
  }
}
