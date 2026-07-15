# `operations/engines/` — the 13 engines

Every engine follows the same shape: a constructor taking the SDK sub-client(s) (or, for
`SearchEngine`/`StatisticsEngine`, other engines) it needs plus an `OperationsCache`, and methods that
fetch, enrich and return Operations DTOs. `FilterEngine`, `ExportEngine` are stateless and exposed as
their class rather than an instance (see `OperationsEngine`'s doc comment).

## 1. `MessageEngine`

The complete message abstraction. `queryMessages(query)` pushes down what the SDK's
`MessageLogFilter` supports server-side (`status`, `integrationFlow`, date range, free-text search),
applies the remaining `OperationsQuery` criteria (`messageType`, `applicationId`, `sender`,
`receiver`, `customStatus`, duration range) and sort in memory via `FilterEngine.forMessages()`, then
paginates the combined result — all over a bounded working set (`DEFAULT_WORKING_SET_SIZE = 500`;
see the class's own doc comment for why this is an honest, documented limitation rather than an
oversight). `getMessage(messageId)` returns the full `MessageDetails` (status, duration, sender,
receiver, message type, custom status, application id, integration flow, correlation id, MPL id —
all present as fields; see that DTO's doc comment for why there is no separate `getXyz()` method per
field). `getMessageStatus`/`getProcessingDuration` are thin projections; `getErrorDetails` and
`findByCorrelationId` are direct SDK-backed lookups.

## 2. `RuntimeEngine`

Wraps `sdk.runtime`. `listArtifacts`/`getArtifact` enrich `RuntimeArtifactStatus` with
`humanReadableStatus`/`health`; `restartArtifact` passes through (a documented future-operations
seam); `getStatusDistribution()` groups artifacts by raw status (reused by `StatisticsEngine`).

## 3. `PayloadEngine`

Prepares payload content: `preparePayload` detects XML/JSON/text/binary from the content type,
pretty-prints XML (a dependency-free, best-effort indenter — the same honest scoping as
`ODataMetadataParser`) and JSON (`JSON.stringify(..., null, 2)`), parses a JSON tree, and reports a
humanized size. `toDownloadModel` prepares a `{fileName, mimeType, contentBase64}` ready-to-download
model. No UI rendering happens here — everything returned is data.

## 4. `HeaderEngine`

A pure transformation engine — no SDK dependency, no fetching. `categorize()` splits a headers bag
into SAP-standard (`SAP_`-prefixed) vs. custom; `search()` finds entries by name/value substring. See
the class's doc comment for why it doesn't fetch headers itself today (no `core/providers` contract
yet exposes message-level header retrieval) — it's the seam ready for when one does.

## 5. `AttachmentEngine`

Lists attachment metadata (`AttachmentSummary`, with a humanized size) — the listing counterpart to
`PayloadEngine`'s single-attachment content shaping; the two share `sdk.payload` but never duplicate
each other's logic.

## 6. `QueueEngine`

Merges live JMS runtime state (`sdk.jms`) with static queue topology (`config/queues.json`, injected
as `queueConfigs` — this engine never reads configuration files itself) into `QueueSummary`.
`listMessages`/`deleteMessage`/`purgeQueue` pass through; no retry execution (matching
`RealJmsProvider`'s own Phase-5 scope note).

## 7. `CertificateEngine`

Wraps `sdk.certificate`. `listCertificates`/`listExpiring` enrich `CertificateInfo` with
`daysRemaining`/`health`; `search()` filters by alias substring and/or expiry horizon via
`FilterEngine.forCertificates()`.

## 8. `StatisticsEngine`

Aggregates live KPIs over a bounded working set (`DEFAULT_STATISTICS_WINDOW_SIZE = 1000`): failed/
completed/processing/cancelled counts, average/max/min processing time, top-5 senders/receivers/
applications/message types (`transform/AggregationTransform.ts`'s `topRanked`), status distribution
(`countByValue`), and runtime status distribution (delegated to `RuntimeEngine.getStatusDistribution`
— reused, not duplicated). Never persists anything; always a fresh computation (de-duplicated only
by `OperationsCache` for concurrent identical calls).

## 9. `SearchEngine`

The universal search facade. Composes `MessageEngine`/`QueueEngine`/`CertificateEngine` — it adds no
fetching logic of its own, only the cross-domain entry points a search box needs:
`searchMessages(query)` (the full field-rich query), `findMessageById`, `findMessagesByCorrelationId`,
`searchQueues(term)`, `searchCertificates(term)`. Every method returns Operations DTOs only.

## 10. `FilterEngine<T>`

A generic, registerable predicate engine (`register(name, predicate)` / `apply(items, criteria)`) —
the Open/Closed core every other engine's filtering is built on. Four static factories
(`forMessages`, `forRuntime`, `forQueues`, `forCertificates`) pre-register the criteria Phase 6 lists
per domain; adding a new filterable field is one `.register()` call, never a change to `apply()` or
any existing registration.

## 11. `ExportEngine`

Stateless, static-only. `toCsv`/`toJson`/`toXml`/`toExcel` all build on the same row-shape input
(`readonly Record<string, unknown>[]`, typically an array of Operations DTOs); `toExcel` renders a
SpreadsheetML 2003 XML workbook (opens natively in Excel, no binary `.xlsx` dependency added).
`toPdf()` rejects with a typed `ServiceError` — a documented future format, following the exact
Promise-rejection pattern `sdk/auth/FutureAuthProviders.ts` established for future extension points.

## 12. `RefreshEngine`

Centralizes polling: `refreshNow(callback)` for manual refresh, `subscribe(key, intervalMs, callback)`
/`unsubscribe(key)` for automatic polling, `cancelAll()` for teardown. Deliberately config-agnostic —
resolving a *named* refresh profile (`config/refresh.json`) into a concrete interval is the
composition root's job, matching every other engine's dependency-injection discipline. See the
class's own doc comment for the future-WebSocket note (the platform already has
`core/websocket/wsServer.ts`; a subscription callback can publish onto it with no change here).

## 13. `NotificationEngine`

Wraps `sdk.alertNotification`, mapping `AlertEvent.severity` into the normalized `Severity`
vocabulary (`info`/`warning`/`error`/`critical`) every Operations DTO speaks.
