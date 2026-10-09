import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { configService } from "../../config/ConfigService.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PayloadDownloadModel, PayloadSummary } from "../../operations/dto/index.js";
import type { JmsMessagePayload } from "../../core/providers/types.js";
import type {
  JmsPayloadReference,
  StudioSourceHint,
  PayloadMetadataDto,
  PayloadSource,
  PayloadStudioDto,
  RetryStatus,
} from "./dto.js";

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
   *
   * Payload sources, first match wins: the JMS message body when one is named (`hint.jms`), the
   * documents of a named interchange (`hint.interchangeId`), the MPL's own attachments, the
   * documents of the B2B interchange the MPL belongs to, then Splunk.
   *
   * @param messageId the MPL message id (or, with `hint.jms` and no MPL, the JMS message id).
   * @param hint where the caller wants the payload read from, when it knows.
   * @returns the composed payload, or `undefined` when the message is unknown.
   */
  public async getStudio(
    messageId: string,
    hint: StudioSourceHint = {},
  ): Promise<PayloadStudioDto | undefined> {
    const jms = hint.jms;
    const engine = this.engineFactory();
    const details = await engine.message.getMessage(messageId);
    if (details === undefined) {
      return jms === undefined ? undefined : PayloadStudioService.jmsOnlyStudio(engine, jms);
    }

    const attachments = await engine.attachment.listAttachments(messageId);
    let requestPayload: PayloadSummary | undefined;
    let responsePayload: PayloadSummary | undefined;
    let payloadSource: PayloadSource;
    let compression: PayloadMetadataDto["compression"] = "none";
    const b2b =
      jms !== undefined
        ? {}
        : hint.interchangeId !== undefined
          ? await PayloadStudioService.interchangeDocuments(engine, hint.interchangeId, messageId)
          : attachments.length === 0
            ? await PayloadStudioService.b2bPayloads(engine, messageId)
            : {};

    if (jms !== undefined) {
      requestPayload = await PayloadStudioService.jmsPayload(engine, jms);
      payloadSource = requestPayload === undefined ? "unavailable" : "jms";
    } else if (b2b.request !== undefined || b2b.response !== undefined) {
      // No attachments, but the MPL is part of a B2B interchange: show its received and sent documents.
      requestPayload = b2b.request;
      responsePayload = b2b.response;
      payloadSource = "b2b";
    } else if (attachments.length > 0) {
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

  /** Reads a JMS message's broker body as a payload summary; `undefined` when it left the queue. */
  private static async jmsPayload(
    engine: OperationsEngine,
    jms: JmsPayloadReference,
  ): Promise<PayloadSummary | undefined> {
    const body = await engine.queue.getMessagePayload(jms.queueName, jms.messageId);
    if (body === undefined) {
      return undefined;
    }
    return engine.payload.summarize({
      messageId: jms.messageId,
      attachmentId: `jms:${jms.messageId}`,
      name: "jms-message",
      contentType: PayloadStudioService.sniffContentType(body),
      sizeBytes: body.sizeBytes,
      content: body.content,
    });
  }

  /**
   * The received (request) and sent (response) documents of the B2B interchange an MPL belongs to.
   * Best-effort: a tenant without Trading Partner Management simply has none.
   */
  private static async b2bPayloads(
    engine: OperationsEngine,
    mplId: string,
  ): Promise<{ readonly request?: PayloadSummary; readonly response?: PayloadSummary }> {
    try {
      const interchange = await engine.b2b.findInterchangeByMplId(mplId);
      return interchange === undefined
        ? {}
        : await PayloadStudioService.interchangeDocuments(engine, interchange.id, mplId);
    } catch {
      return {};
    }
  }

  /** The received (request) and sent (response) documents of one interchange. */
  private static async interchangeDocuments(
    engine: OperationsEngine,
    interchangeId: string,
    mplId: string,
  ): Promise<{ readonly request?: PayloadSummary; readonly response?: PayloadSummary }> {
    try {
      const detail = await engine.b2b.getInterchange(interchangeId);
      if (detail === undefined) {
        return {};
      }
      const outbound = (direction: string | undefined): boolean =>
        /out|sent|send/i.test(direction ?? "");
      const received = detail.payloads.find((payload) => !outbound(payload.direction));
      const sent = detail.payloads.find((payload) => outbound(payload.direction));
      const load = async (
        info: (typeof detail.payloads)[number] | undefined,
        name: string,
      ): Promise<PayloadSummary | undefined> => {
        const payload = info === undefined ? undefined : await engine.b2b.getPayload(info.id);
        return payload === undefined
          ? undefined
          : engine.payload.summarize({
              messageId: mplId,
              attachmentId: `b2b:${payload.id}`,
              name,
              contentType:
                payload.contentType ??
                (payload.encoding === "base64" ? "application/octet-stream" : "text/plain"),
              sizeBytes: payload.sizeBytes,
              content: payload.content,
            });
      };
      const [request, response] = await Promise.all([
        load(received, "received-document"),
        load(sent, "sent-document"),
      ]);
      return { request, response };
    } catch {
      return {};
    }
  }

  /**
   * Studio data for a JMS message with no processing log (or none this tenant still keeps): the
   * broker body plus the message's own JMS properties.
   */
  private static async jmsOnlyStudio(
    engine: OperationsEngine,
    jms: JmsPayloadReference,
  ): Promise<PayloadStudioDto | undefined> {
    const message = await engine.queue.getMessage(jms.queueName, jms.messageId);
    if (message === undefined) {
      return undefined;
    }
    const requestPayload = await PayloadStudioService.jmsPayload(engine, jms);
    const properties: Record<string, string> = {};
    const entries: [string, string | number | undefined][] = [
      ["JMS_Queue", jms.queueName],
      ["JMS_MessageId", jms.messageId],
      ["SAP_MessageProcessingLogID", message.mplId],
      ["SAP_Sender", message.sender],
      ["SAP_Receiver", message.receiver],
      ["SAP_MessageType", message.messageType],
      ["SAP_ApplicationID", message.applicationId],
      ["JMS_RetryCount", message.retryCount],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined && value !== "") {
        properties[key] = String(value);
      }
    }
    const headerSummary = engine.header.categorize(properties);
    const charset = PayloadStudioService.extractCharset(requestPayload?.contentType);
    return {
      metadata: {
        messageId: jms.messageId,
        correlationId: message.correlationId ?? "",
        applicationId: message.applicationId,
        integrationFlow: "",
        environment: configService.getEnvironment().label,
        tenantId: configService.getTenant().id,
        encoding: charset,
        characterSet: charset,
        compression: "none",
        contentType: requestPayload?.contentType,
        payloadSizeBytes: requestPayload?.sizeBytes,
        payloadSizeHuman: requestPayload?.sizeHuman ?? "",
        creationTime: message.enqueuedAt,
        processingDurationMs: undefined,
        processingDurationHuman: "",
        retryStatus: "retryable",
        payloadSource: requestPayload === undefined ? "unavailable" : "jms",
      },
      requestPayload,
      responsePayload: undefined,
      attachments: [],
      headers: headerSummary,
      properties: headerSummary,
    };
  }

  /** A JMS body carries no content type; infer one from its first characters. */
  private static sniffContentType(body: JmsMessagePayload): string {
    if (body.encoding === "base64") {
      return "application/octet-stream";
    }
    const start = body.content.trimStart();
    if (start.startsWith("<")) {
      return "application/xml";
    }
    if (start.startsWith("{") || start.startsWith("[")) {
      return "application/json";
    }
    if (start.startsWith("ISA")) {
      return "application/edi-x12";
    }
    if (start.startsWith("UNA") || start.startsWith("UNB")) {
      return "application/edifact";
    }
    return "text/plain";
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
