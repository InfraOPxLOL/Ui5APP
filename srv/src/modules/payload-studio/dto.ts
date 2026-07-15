import type {
  PayloadSummary,
  AttachmentSummary,
  HeaderSummary,
} from "../../operations/dto/index.js";

/**
 * Data transfer objects for Payload Studio (Phase 10) — a professional payload investigation
 * environment, opened from the Message Investigation Workspace. Every shape here is built from the
 * Operations Engine's own DTOs (`operations/dto`); `PayloadStudioService` never leaks an SDK/CPI/
 * OData shape. Fields the underlying domain model does not carry (encoding, compression) are
 * honestly derived from what *is* available (content type) rather than fabricated.
 */

/** UI classification of retry eligibility, derived server-side from `status`/`customStatus` — mirrors `message-monitoring`'s own derivation (§ Metadata Panel — Retry Information). */
export type RetryStatus = "retryable" | "escalated" | "not-applicable";

/**
 * Where a message's payload content actually came from — the honesty label the Metadata Panel
 * displays. `"mpl"`: recorded as an Integration Suite MPL attachment (the normal, richest case).
 * `"splunk"`: no MPL attachment existed, so `PayloadEngine.prepareFromSplunk` recovered it from
 * Splunk instead. `"unavailable"`: neither source had anything — `requestPayload`/`responsePayload`
 * are honestly `undefined`, never fabricated.
 */
export type PayloadSource = "mpl" | "splunk" | "unavailable";

/**
 * The metadata panel's data for one message (§ Metadata Panel). `encoding`/`characterSet` are
 * derived from the primary payload's content type (e.g. `application/xml;charset=UTF-8`); when no
 * charset is declared, UTF-8 is assumed since `PayloadEnvelope.content` is already decoded text.
 * `compression` is `"gzip"` when the payload came from the Splunk fallback (CPI compresses payload
 * bodies before pushing them to Splunk — a real, honest passthrough of that event's own declared
 * compression) and `"none"` otherwise (the MPL domain model carries no transfer-compression
 * indicator).
 */
export interface PayloadMetadataDto {
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
 * The full Payload Studio payload for one message (§ Layout, § Payload Navigation).
 *
 * `requestPayload` is the first recorded attachment (a genuine, documented convention: the mock
 * fixtures — and, typically, real CPI Message Processing Logs — record the inbound payload first).
 * `responsePayload` is the second attachment, when one was recorded; today's mock provider always
 * records exactly one attachment per message, so `responsePayload` is honestly `undefined` in mock
 * mode rather than fabricated — this is a documented seam, ready the moment a real tenant (or a
 * future mock scenario) records a second payload.
 */
export interface PayloadStudioDto {
  readonly metadata: PayloadMetadataDto;
  readonly requestPayload: PayloadSummary | undefined;
  readonly responsePayload: PayloadSummary | undefined;
  readonly attachments: readonly AttachmentSummary[];
  /** SAP-standard vs. custom headers (§ Headers) — see `MessageDetails`'s own doc comment on why these are `{}` today. */
  readonly headers: HeaderSummary;
  /**
   * Exchange/message properties (§ Properties). Reuses the *same* categorized headers bag as
   * `headers` — the domain model carries one headers/properties bag today, not the distinct
   * Camel-header / exchange-property / application-property namespaces a real Integration Suite
   * tenant exposes. Documented seam, not a fabricated second data source.
   */
  readonly properties: HeaderSummary;
}
