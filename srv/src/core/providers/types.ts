/**
 * Domain types spoken by the provider interfaces (`core/providers/*`).
 *
 * These are the platform's neutral shapes for Integration Suite concepts — deliberately defined
 * here, not in any module, so provider implementations translate raw CPI payloads into them at the
 * boundary and no upstream schema ever leaks into module services. All types are plain data
 * (no behaviour) and readonly.
 */

/** Context every provider call executes under. */
export interface ProviderContext {
  /** Target tenant id (from `tenants.json`). */
  readonly tenantId: string;
  /** Correlation id propagated end-to-end for tracing. */
  readonly correlationId: string;
}

/** Standard paging instruction for provider list operations. */
export interface ProviderPage {
  readonly skip: number;
  readonly top: number;
}

/** Standard paged result returned by provider list operations. */
export interface ProviderPagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
}

// --- Monitoring ---------------------------------------------------------------------------------

/** A message processing log (MPL) entry. */
export interface MessageProcessingLog {
  readonly messageId: string;
  readonly correlationId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly processingTimeMs: number | undefined;
  readonly sender: string;
  readonly receiver: string;
  readonly customStatus: string | undefined;
  /** The upstream application-defined message id (CPI `ApplicationMessageId`), when recorded. */
  readonly applicationId: string | undefined;
  /** The upstream application-defined message type (CPI `ApplicationMessageType`), when recorded. */
  readonly messageType: string | undefined;
}

/** Filter criteria for querying message processing logs. */
export interface MessageLogFilter {
  readonly status?: string;
  readonly integrationFlow?: string;
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
}

/** A single error detail attached to a failed message. */
export interface MessageErrorDetail {
  readonly messageId: string;
  readonly text: string;
  readonly category: string | undefined;
}

/** One custom header property attached to a message (`MessageProcessingLogCustomHeaderProperty`). */
export interface MessageHeader {
  readonly name: string;
  readonly value: string;
}

// --- Runtime artifacts ---------------------------------------------------------------------------

/** Deployment/runtime status of a deployed integration artifact. */
export interface RuntimeArtifactStatus {
  readonly artifactId: string;
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly status: string;
  readonly deployedOn: string | undefined;
  readonly deployedBy: string | undefined;
  readonly errorText: string | undefined;
}

// --- JMS ------------------------------------------------------------------------------------------

/** Runtime state of a JMS queue. */
export interface QueueRuntimeInfo {
  readonly queueName: string;
  readonly state: string;
  readonly messageCount: number;
  /** Per-queue consumer counts are not exposed by the JMS OData API — `undefined` means unknown. */
  readonly consumerCount: number | undefined;
  readonly capacityUsedPct: number;
}

/** One message currently sitting on a JMS queue. */
export interface QueuedMessage {
  readonly messageId: string;
  readonly queueName: string;
  readonly enqueuedAt: string;
  readonly retryCount: number;
  readonly sizeBytes: number | undefined;
}

// --- Payloads -------------------------------------------------------------------------------------

/** A stored payload/attachment belonging to a processed message. */
export interface PayloadEnvelope {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number | undefined;
  /** The payload body as text; binary payloads are base64-encoded with a matching contentType. */
  readonly content: string;
}

// --- Certificates / security materials -------------------------------------------------------------

/** A keystore entry (certificate or key pair) on the tenant. */
export interface CertificateInfo {
  readonly alias: string;
  readonly keyType: string;
  readonly owner: string | undefined;
  readonly issuer: string | undefined;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string | undefined;
}

// --- Alerts ----------------------------------------------------------------------------------------

/** A platform alert event (raised locally or relayed from SAP Alert Notification). */
export interface AlertEvent {
  readonly alertId: string;
  readonly severity: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly raisedAt: string;
  readonly tags: readonly string[];
}

// --- Value mapping ----------------------------------------------------------------------------------

/** One source→target value pair within a value mapping agency/identifier pair. */
export interface ValueMappingEntry {
  readonly sourceValue: string;
  readonly targetValue: string;
}

/** One agency/identifier scope within a value mapping scheme (e.g. a B2B partner code list). */
export interface ValueMappingAgency {
  readonly agency: string;
  readonly identifier: string;
  readonly entries: readonly ValueMappingEntry[];
}

/** A complete value mapping scheme, as managed by SAP Integration Suite's Value Mapping feature. */
export interface ValueMappingScheme {
  readonly name: string;
  readonly description: string | undefined;
  readonly agencies: readonly ValueMappingAgency[];
}

// --- Partner Directory ------------------------------------------------------------------------------

/**
 * One Partner Directory string parameter (SAP Integration Suite's `StringParameters` entity set,
 * key `(Pid, Id)`). The backing store for the CoE Framework's global settings, per-route queue
 * matrix and agreement rulesets — read and written through {@link IPartnerDirectoryProvider}.
 */
export interface PartnerDirectoryStringParameter {
  /** Owning Partner ID (e.g. `.SYS_JMS_FRAMEWORK`). */
  readonly pid: string;
  /** Parameter id within the partner (e.g. `DEFAULT_RETRIES`). */
  readonly id: string;
  /** The parameter's string value. */
  readonly value: string;
  /** Who last modified the parameter, when the tenant records it. */
  readonly lastModifiedBy: string | undefined;
  /** When the parameter was last modified (ISO 8601), when the tenant records it. */
  readonly lastModifiedAt: string | undefined;
}

/**
 * One Partner Directory binary parameter (`BinaryParameters` entity set, key `(Pid, Id)`, confirmed
 * present in the tenant `$metadata` — `BinaryParameter` extends the same `Parameter` base as
 * `StringParameter`, adding `ContentType` and an `Edm.Binary` `Value` with no `m:HasStream`, so it
 * travels as a plain base64 string in the JSON payload exactly like a string field). Backs the CoE
 * Visual Rule Builder's authored rules (Agreement Ruleset / X-Cast Endpoint Resolver JSON, stored
 * base64-encoded).
 */
export interface PartnerDirectoryBinaryParameter {
  /** Owning Partner ID. */
  readonly pid: string;
  /** Parameter id within the partner (e.g. a rule name referenced from a `RULESET_` string parameter). */
  readonly id: string;
  /** MIME type of the decoded value (the Visual Rule Builder always writes `application/json`). */
  readonly contentType: string;
  /** The parameter's value, base64-encoded (never decoded at this layer — modules decode as needed). */
  readonly valueBase64: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

// --- Splunk (payload fallback) ---------------------------------------------------------------------

/**
 * The known fields of a message, passed to {@link ISplunkProvider.getMessageEvent} so a lookup can
 * be scoped/correlated to the right event (e.g. by `correlationId`) — not used to fabricate data,
 * only to find it.
 */
export interface SplunkQueryHint {
  readonly integrationFlow: string;
  readonly sender: string;
  readonly receiver: string;
  readonly messageType: string | undefined;
  readonly applicationId: string | undefined;
  readonly correlationId: string;
  readonly status: string;
}

/** One already-decoded payload body recovered from a Splunk event (gzip+base64 decoded at the provider boundary). */
export interface SplunkPayloadBody {
  readonly content: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** The transfer compression the event declared for this body (e.g. `"gzip"`) — honest passthrough, not fabricated. */
  readonly compression: string;
}

/**
 * A message event recovered from Splunk (architecture: Payload fallback — CPI pushes message data
 * to Splunk via HTTP Event Collector; when a message has no MPL attachments, this is the fallback
 * payload source). Deliberately narrower than the full Splunk HEC event this is translated from —
 * only what Payload Studio actually consumes today; see `sdk/mock/fixtures/SplunkFixtures.ts` for
 * the full upstream wire shape.
 */
export interface SplunkMessageEvent {
  readonly messageId: string;
  readonly correlationId: string;
  readonly requestPayload: SplunkPayloadBody | undefined;
  readonly responsePayload: SplunkPayloadBody | undefined;
}
