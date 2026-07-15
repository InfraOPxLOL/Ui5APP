# `operations/transform/` — shared enrichment helpers

Pure functions only — no I/O, no state, no SDK dependency. Every engine that needs the same
calculation imports from here rather than re-deriving it, satisfying Phase 6's repeated "no
duplicated code" mandate.

| Module | Exports | Used by |
|---|---|---|
| `StatusTransform.ts` | `Severity` (the normalized `info`/`warning`/`error`/`critical` vocabulary), `severityOfStatus`, `humanReadableStatus` | `MessageEngine`, `NotificationEngine` |
| `DurationTransform.ts` | `calculateDurationMs`, `formatDurationHuman` | `MessageEngine`, `StatisticsEngine` |
| `HealthTransform.ts` | `HealthStatus` (`healthy`/`warning`/`critical`), `daysRemaining`, `certificateHealth`, `runtimeHealth`, `queueHealth`, `clampUtilization` | `CertificateEngine`, `RuntimeEngine`, `QueueEngine` |
| `SizeTransform.ts` | `formatBytesHuman` | `AttachmentEngine`, `PayloadEngine` |
| `AggregationTransform.ts` | `countByValue`, `topRanked` | `RuntimeEngine.getStatusDistribution`, `StatisticsEngine` |

## Why one `Severity`/`HealthStatus` vocabulary, not one per domain

A message, a notification, a certificate and a runtime artifact all answer fundamentally the same
question ("is this okay, and how urgently should someone look at it?"). Sharing one small, closed
vocabulary across every DTO means a future dashboard can render all of them with the same badge
component — the whole point of normalizing at this layer rather than leaving each domain's raw status
strings for the UI to interpret separately.
