# `operations/dto/` — the Operations DTO layer

The **only** shapes any future UI module is allowed to consume (architecture: Phase 6, DTO Layer,
§14). No SDK/core domain type, no OData envelope, no upstream endpoint detail ever crosses this
boundary — every engine maps into one of these before returning.

| DTO | Produced by | Notes |
|---|---|---|
| `MessageSummary` / `MessageDetails` | `MessageEngine` | List-shaped vs. full single-message view. `MessageDetails` adds `mplId` (an alias of `messageId`), `errorDetails`, and a SAP-standard/custom header split (currently always `{}` — documented seam, see the DTO's own comment). |
| `RuntimeSummary` | `RuntimeEngine` | `version`/`node` are documented future fields pending an additive `RuntimeArtifactStatus` extension. |
| `QueueSummary` / `QueuedMessageSummary` | `QueueEngine` | Merges live JMS state with static `config/queues.json` topology. |
| `CertificateSummary` | `CertificateEngine` | `subject`/`fingerprint` are documented future fields; `owner` is intentionally not presented as `subject` (related but not interchangeable). |
| `PayloadSummary` / `PayloadDownloadModel` | `PayloadEngine` | `raw`/`formatted`/`tree` cover every view a payload viewer needs; no markup, no rendering. |
| `HeaderEntry` / `HeaderSummary` | `HeaderEngine` | The SAP-standard/custom split. |
| `AttachmentSummary` | `AttachmentEngine` | Metadata only (no content — see `PayloadSummary` for content). |
| `StatisticsSummary` (`ValueCount`, `RankedEntry`) | `StatisticsEngine` | Every KPI Phase 6 lists, computed fresh each call. |
| `SearchResult<T>` | `SearchEngine` (and `MessageEngine`/`QueueEngine.listMessages`/`NotificationEngine`) | The universal paged-result envelope — generic over whichever summary DTO is being searched. |
| `NotificationSummary` | `NotificationEngine` | Normalized severity vocabulary regardless of source. |
| `DashboardSummary` | `OperationsEngine.getDashboardSummary()` | Composes `StatisticsSummary` + runtime health counts + recent notifications. No Dashboard UI is built in this phase — this is the data shape a future one will consume. |
| `ExportModel` | `ExportEngine` | `{format, fileName, mimeType, content}` — the model only; serving it over HTTP is a future route handler's job. |

## Why generic DTOs (`SearchResult<T>`) instead of one per domain

A `MessageSearchResult`/`QueueSearchResult`/`CertificateSearchResult` trio would be three identical
shapes with different names — pure duplication. `SearchResult<T>` is the one envelope; `T` varies.
