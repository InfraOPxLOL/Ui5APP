import { gzipSync } from "node:zlib";
import type { SplunkQueryHint } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

/**
 * Raw shape of one Splunk HTTP Event Collector envelope for a CPI message-processing event — the
 * upstream wire shape CPI actually pushes to Splunk (gzip+base64-encoded payload bodies included).
 * `MockSplunkProvider` is the only consumer; it decodes this into the neutral `SplunkMessageEvent`
 * domain type (`core/providers/types.ts`) before anything leaves the SDK, exactly like every other
 * `Mock*`/`Real*` provider's own upstream-shape-to-domain-shape translation.
 */
export interface SplunkHecEvent {
  readonly time: number;
  readonly host: string;
  readonly source: string;
  readonly sourcetype: string;
  readonly index: string;
  readonly event: {
    readonly eventType: string;
    readonly environment: string;
    readonly tenantName: string;
    readonly tenantUrl: string;
    readonly integrationPackage: string;
    readonly integrationFlow: string;
    readonly integrationArtifactVersion: string;
    readonly status: string;
    readonly messageProcessingLogId: string;
    readonly correlationId: string;
    readonly sapSender: string;
    readonly sapReceiver: string;
    readonly sapMessageType: string;
    readonly sapApplicationId: string;
    readonly uid: string;
    readonly sapCustomLogStatus: string;
    readonly logLevel: string;
    readonly processingTimeMs: number;
    readonly retryCount: number;
    readonly createdAt: string;
    readonly completedAt: string;
    readonly senderAdapter: string;
    readonly receiverAdapter: string;
    readonly requestPayloadEncoding: string;
    readonly requestPayloadCompression: string;
    readonly requestPayloadMimeType: string;
    readonly requestPayload: string;
    readonly responsePayloadEncoding: string;
    readonly responsePayloadCompression: string;
    readonly responsePayloadMimeType: string;
    readonly responsePayload: string;
    readonly attachments: readonly {
      readonly name: string;
      readonly contentType: string;
      readonly sizeBytes: number;
    }[];
    readonly customHeaders: Readonly<Record<string, string>>;
    readonly properties: Readonly<Record<string, string>>;
    readonly error:
      | {
          readonly category: string;
          readonly code: string;
          readonly message: string;
          readonly exception: string;
          readonly stackTrace: string;
        }
      | undefined;
    readonly application: string;
    readonly monitoringTool: { readonly name: string; readonly version: string };
  };
}

function gzipBase64(text: string): string {
  return gzipSync(Buffer.from(text, "utf8")).toString("base64");
}

const SAMPLE_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ORDERS05>
  <IDOC BEGIN="1">
    <EDI_DC40 SEGMENT="1">
      <DOCNUM>0000000001234567</DOCNUM>
      <MESTYP>ORDERS</MESTYP>
    </EDI_DC40>
    <E1EDK01 SEGMENT="1">
      <BELNR>4500123456</BELNR>
      <CURCY>USD</CURCY>
    </E1EDK01>
  </IDOC>
</ORDERS05>`;

const SAMPLE_RESPONSE_JSON = JSON.stringify(
  {
    salesDocument: "4500123456",
    orderNumber: "1000456",
    status: "CONFIRMED",
    confirmedAt: "2026-07-11T09:15:44Z",
  },
  null,
  2,
);

// Compressed once at module load (Node caches the module instance, so this runs exactly once per
// process) — every generated event reuses the same compressed bytes, exercising the real
// gzip+base64 decode path rather than a fake/plain string.
const REQUEST_PAYLOAD_GZIP_B64 = gzipBase64(SAMPLE_REQUEST_XML);
const RESPONSE_PAYLOAD_GZIP_B64 = gzipBase64(SAMPLE_RESPONSE_JSON);

const FAILURE_STATUSES = new Set(["FAILED", "ESCALATED", "RETRY", "ABANDONED", "DISCARDED"]);

/**
 * Generates a realistic Splunk HEC event for one message, for the mock engine's `SplunkProvider`
 * implementation. Echoes `hint`'s real fields (integration flow, sender/receiver, status,
 * correlation id) into the event rather than generating unrelated random values, so the fallback
 * record looks coherent against whatever real/mock message it's attached to.
 * @param messageId the MPL message id.
 * @param hint known fields of the message being looked up.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated raw HEC event.
 */
export function generateSplunkHecEvent(
  messageId: string,
  hint: SplunkQueryHint,
  seed = 42,
): SplunkHecEvent {
  const rng = new SeededRandom(seed);
  const isFailure = FAILURE_STATUSES.has(hint.status.toUpperCase());
  const now = Date.now();
  const createdAt = new Date(now - rng.int(1000, 60000)).toISOString();
  const completedAt = new Date(now).toISOString();

  return {
    time: Math.floor(now / 1000),
    host: "SAP-CPI",
    source: "MiddlewareMonitoring",
    sourcetype: "sap:cpi",
    index: "main",
    event: {
      eventType: "MPL",
      environment: "DEV",
      tenantName: "DEV Tenant",
      tenantUrl: "https://tenant.it-cpitrial05.cfapps.us10-001.hana.ondemand.com",
      integrationPackage: "Order Management",
      integrationFlow: hint.integrationFlow,
      integrationArtifactVersion: "1.0.0",
      status: hint.status,
      messageProcessingLogId: messageId,
      correlationId: hint.correlationId,
      sapSender: hint.sender,
      sapReceiver: hint.receiver,
      sapMessageType: hint.messageType ?? "ORDERS",
      sapApplicationId: hint.applicationId ?? hint.sender,
      uid: `${messageId}-${rng.int(1000, 9999)}`,
      sapCustomLogStatus: isFailure ? "BUSINESS_ERROR" : "SUCCESS",
      logLevel: isFailure ? "ERROR" : "INFO",
      processingTimeMs: rng.int(200, 3000),
      retryCount: isFailure ? rng.int(0, 3) : 0,
      createdAt,
      completedAt,
      senderAdapter: "HTTPS",
      receiverAdapter: "IDOC",
      requestPayloadEncoding: "base64",
      requestPayloadCompression: "gzip",
      requestPayloadMimeType: "application/xml",
      requestPayload: REQUEST_PAYLOAD_GZIP_B64,
      responsePayloadEncoding: "base64",
      responsePayloadCompression: "gzip",
      responsePayloadMimeType: "application/json",
      responsePayload: RESPONSE_PAYLOAD_GZIP_B64,
      attachments: [
        {
          name: "Payload.xml",
          contentType: "application/xml",
          sizeBytes: SAMPLE_REQUEST_XML.length,
        },
      ],
      customHeaders: {
        SAP_Sender: hint.sender,
        SAP_Receiver: hint.receiver,
        SAP_MessageType: hint.messageType ?? "ORDERS",
        SAP_ApplicationID: hint.applicationId ?? hint.sender,
        CorrelationId: hint.correlationId,
      },
      properties: {
        SalesDocument: "4500123456",
        OrderNumber: "1000456",
      },
      error: isFailure
        ? {
            category: "Adapter",
            code: "HTTP_500",
            message: "Receiver IDoc Adapter failed",
            exception: "com.sap.gateway.core.ip.component.odata.exception.OsciException",
            stackTrace: gzipBase64("<stack trace unavailable in mock mode>"),
          }
        : undefined,
      application: "SAP Integration Suite",
      monitoringTool: { name: "Middleware Monitoring Platform", version: "1.0.0" },
    },
  };
}
