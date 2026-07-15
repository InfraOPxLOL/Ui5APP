/**
 * Client-side mirror of the backend Payload Studio DTOs (`/api/v1/payload-studio`, itself composed
 * entirely from the Operations Engine). These are the only shapes the workspace consumes — no SDK,
 * OData or CPI shape ever reaches the UI (architecture: UI → Operations Engine → SDK → Integration
 * Suite).
 */

/** UI classification of retry eligibility, derived server-side from `status`/`customStatus`. */
export type RetryStatus = "retryable" | "escalated" | "not-applicable";

/**
 * Where a message's payload content actually came from. `"mpl"`: a real Integration Suite MPL
 * attachment. `"splunk"`: no MPL attachment existed, recovered from Splunk instead (mock-backed
 * today — see the backend's `MockSplunkProvider`). `"unavailable"`: neither source had anything.
 */
export type PayloadSource = "mpl" | "splunk" | "unavailable";

/** The content shapes the payload editor recognizes and prepares distinct views for. */
export type PayloadFormat = "xml" | "json" | "text" | "binary";

/** One prepared payload view (§ Payload Editor). */
export interface PayloadView {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly format: PayloadFormat;
  readonly raw: string;
  readonly formatted: string;
  readonly tree: unknown;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}

/** One header/property entry, categorized as SAP-standard or custom. */
export interface HeaderEntry {
  readonly name: string;
  readonly value: string;
  readonly category: "sap-standard" | "custom";
}

/** Categorized headers/properties. */
export interface HeaderSummary {
  readonly all: readonly HeaderEntry[];
  readonly sapStandard: readonly HeaderEntry[];
  readonly custom: readonly HeaderEntry[];
}

/** One attachment's metadata (§ Attachments). */
export interface AttachmentSummary {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}

/** The metadata panel's data for one message (§ Metadata Panel). */
export interface PayloadMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly applicationId: string | undefined;
  readonly integrationFlow: string;
  readonly environment: string;
  readonly tenantId: string;
  readonly encoding: string;
  readonly characterSet: string;
  readonly compression: "none" | "gzip";
  readonly contentType: string | undefined;
  readonly payloadSizeBytes: number | undefined;
  readonly payloadSizeHuman: string;
  readonly creationTime: string;
  readonly processingDurationMs: number | undefined;
  readonly processingDurationHuman: string;
  readonly retryStatus: RetryStatus;
  readonly payloadSource: PayloadSource;
}

/**
 * The full Payload Studio payload for one message. `responsePayload` is honestly `undefined` unless
 * a second attachment was actually recorded for the message (see the backend DTO's doc comment) —
 * never fabricated.
 */
export interface PayloadStudioData {
  readonly metadata: PayloadMetadata;
  readonly requestPayload: PayloadView | undefined;
  readonly responsePayload: PayloadView | undefined;
  readonly attachments: readonly AttachmentSummary[];
  readonly headers: HeaderSummary;
  readonly properties: HeaderSummary;
}

/** A ready-to-download representation of one payload. */
export interface PayloadDownloadModel {
  readonly fileName: string;
  readonly mimeType: string;
  readonly contentBase64: string;
}

/** Which payload the editor is currently showing (§ Payload Navigation). */
export type PayloadSlot = "request" | "response";

/** The editor's rendering mode (§ Payload Editor). */
export type PayloadViewMode = "pretty" | "raw" | "tree";
