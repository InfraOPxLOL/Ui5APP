import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { configService } from "../../config/ConfigService.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PayloadDownloadModel, PayloadSummary } from "../../operations/dto/index.js";
import type { PayloadMetadataDto, PayloadSource, PayloadStudioDto, RetryStatus } from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const FUNCTIONAL_ERROR_STATUSES = new Set(["ESCALATED", "RETRY"]);
const TECHNICAL_ERROR_STATUSES = new Set(["FAILED", "ABANDONED", "DISCARDED"]);
const DEFAULT_CHARSET = "UTF-8";

/**
 * Aggregation service for Payload Studio (Phase 10). Builds a fresh, request-scoped
 * {@link OperationsEngine} per call (matching every other Operations-Engine-consuming module in this
 * codebase) and composes `engine.message`/`engine.attachment`/`engine.payload`/`engine.header` into
 * the {@link PayloadStudioDto} the workspace consumes. No SDK, OData or CPI shape ever leaves this
 * layer.
 */
export class PayloadStudioService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Composes the full Payload Studio payload for a message.
   * @param messageId the MPL message id.
   * @returns the composed payload, or `undefined` when the message is unknown.
   */
  public async getStudio(messageId: string): Promise<PayloadStudioDto | undefined> {
    const engine = this.engineFactory();
    const details = await engine.message.getMessage(messageId);
    if (details === undefined) {
      return undefined;
    }

    const attachments = await engine.attachment.listAttachments(messageId);
    let requestPayload: PayloadSummary | undefined;
    let responsePayload: PayloadSummary | undefined;
    let payloadSource: PayloadSource;
    let compression: PayloadMetadataDto["compression"] = "none";

    if (attachments.length > 0) {
      // MPL recorded at least one attachment — the normal, richest case.
      const requestAttachmentId = attachments[0]?.attachmentId;
      const responseAttachmentId = attachments[1]?.attachmentId;
      [requestPayload, responsePayload] = await Promise.all([
        requestAttachmentId === undefined
          ? Promise.resolve(undefined)
          : engine.payload.preparePayload(messageId, requestAttachmentId),
        responseAttachmentId === undefined
          ? Promise.resolve(undefined)
          : engine.payload.preparePayload(messageId, responseAttachmentId),
      ]);
      payloadSource = "mpl";
    } else {
      // No MPL attachment — fall back to the copy of this message CPI pushed to Splunk.
      const splunk = await engine.payload.prepareFromSplunk(messageId, {
        integrationFlow: details.integrationFlow,
        sender: details.sender,
        receiver: details.receiver,
        messageType: details.messageType,
        applicationId: details.applicationId,
        correlationId: details.correlationId,
        status: details.status,
      });
      requestPayload = splunk.requestPayload;
      responsePayload = splunk.responsePayload;
      payloadSource =
        requestPayload !== undefined || responsePayload !== undefined ? "splunk" : "unavailable";
      compression = payloadSource === "splunk" ? "gzip" : "none";
    }

    const headerSummary = engine.header.categorize({
      ...details.sapStandardHeaders,
      ...details.customHeaders,
    });

    const primaryContentType = requestPayload?.contentType ?? attachments[0]?.contentType;
    const charset = PayloadStudioService.extractCharset(primaryContentType);
    const metadata: PayloadMetadataDto = {
      messageId: details.messageId,
      correlationId: details.correlationId,
      applicationId: details.applicationId,
      integrationFlow: details.integrationFlow,
      environment: configService.getEnvironment().label,
      tenantId: configService.getTenant().id,
      encoding: charset,
      characterSet: charset,
      compression,
      contentType: primaryContentType,
      payloadSizeBytes: requestPayload?.sizeBytes ?? attachments[0]?.sizeBytes,
      payloadSizeHuman: requestPayload?.sizeHuman ?? "",
      creationTime: details.startTime,
      processingDurationMs: details.processingTimeMs,
      processingDurationHuman: details.processingTimeHuman,
      retryStatus: PayloadStudioService.toRetryStatus(details.status, details.customStatus),
      payloadSource,
    };

    return {
      metadata,
      requestPayload,
      responsePayload,
      attachments,
      headers: headerSummary,
      properties: headerSummary,
    };
  }

  /**
   * Prepares a ready-to-download model for one attachment (§ Attachments — Download).
   * @param messageId the MPL message id.
   * @param attachmentId the attachment to prepare.
   * @returns the download model, or `undefined` when the message/attachment is unknown.
   */
  public async downloadAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<PayloadDownloadModel | undefined> {
    const engine = this.engineFactory();
    return engine.payload.toDownloadModel(messageId, attachmentId);
  }

  private static extractCharset(contentType: string | undefined): string {
    const match = contentType?.match(/charset=([^;]+)/i);
    return match?.[1]?.trim().toUpperCase() ?? DEFAULT_CHARSET;
  }

  private static toRetryStatus(status: string, customStatus: string | undefined): RetryStatus {
    const normalized = status.toUpperCase();
    if (customStatus !== undefined || FUNCTIONAL_ERROR_STATUSES.has(normalized)) {
      return "escalated";
    }
    if (TECHNICAL_ERROR_STATUSES.has(normalized)) {
      return "retryable";
    }
    return "not-applicable";
  }
}

/** Shared service instance. */
export const payloadStudioService = new PayloadStudioService();
