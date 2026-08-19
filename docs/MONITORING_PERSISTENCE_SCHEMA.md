# Integration Monitoring Platform — Persistence & CPI Integration Specification

**Version:** 1.2
**Status:** Ready for Review
**Primary consumers:** DB Team, Integration Developers (Groovy/iFlow authors), Monitoring Portal Backend
**Scope:** This document does **not** describe SAP's Message Processing Log (MPL) as our own invention. MPL remains SAP's own authoritative record, retrieved through the standard Cloud Integration OData API. This document describes an **MPL-Compatible Persistent Monitoring Repository with Framework Extensions** — a HANA-backed layer that (a) extends MPL retention beyond its ~15-day window, (b) adds payload/header/property capture MPL does not retain long-term, and (c) adds framework-aware classification and recovery state that has no equivalent in SAP's own model.

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Design Principles](#3-core-design-principles)
4. [The Canonical JSON Envelope](#4-the-canonical-json-envelope) — full field reference, block by block
   - 4.1 `message` · 4.2 `environment` · 4.3 `integration` · 4.4 `monitoring` · 4.5 `sop`
   - 4.6 `framework` · 4.7 `payloads[]` · 4.8 `headers[]` · 4.9 `properties[]`
   - 4.10 `failureEvidence[]` · 4.11 `failure` · 4.12 `attachments[]` · 4.13 `events[]`
   - 4.14 `recovery` · 4.15 `audit` · 4.16 `persistence`
5. [Framework Context Shapes](#5-framework-context-shapes)
6. [Queue-Finding Strategy Per Framework](#6-queue-finding-strategy-per-framework)
7. [Worked JSON Examples](#7-worked-json-examples) — every framework, full documents
   - 7.1–7.2 JMS Framework · 7.3–7.8 TPM V2 (5-hop chain + DLQ variant)
   - 7.9 Common IDoc Router · 7.10 IDoc Status Sync · 7.11 Unknown / No framework matched
8. [CPI Integration Architecture](#8-cpi-integration-architecture)
9. [Database Schema — SQL DDL](#9-database-schema--sql-ddl)
10. [Persistence Semantics](#10-persistence-semantics)
11. [Validation Rules](#11-validation-rules)
12. [Open Items & Assumptions](#12-open-items--assumptions)

---

## 1. Purpose & Scope

The HANA database is the persistent monitoring repository behind the Integration Monitoring Portal. It must support:

- Payload persistence beyond MPL's retention window
- Custom headers, properties, and attachments
- Multi-hop transaction reconstruction (one business transaction = several MPL entries)
- Framework classification (TPM V2, JMS Framework, Common IDoc Router, IDoc Status Sync, or none)
- Queue/DLQ location and recovery state
- Recovery operation history (immutable audit trail)
- Historical investigation after MPL's own retention expires
- Feeding Payload Studio, Recovery Center, and the Message Investigation Workspace

SAP's Cloud Integration OData API exposes MPL data plus related entities — custom header properties, message store entries, error information, adapter attributes, attachments, and processing runs. This specification treats that API as **authoritative for MPL data** and never re-derives or overwrites it from another source.

---

## 2. Architecture Overview

**v1.2 revision.** Every business iFlow already carries the Monitoring Groovy at each of its real decision points — the normal (success) path, any Local Integration Process boundary, and the exception subprocess (failure path). Because Groovy is present at every outcome, not just the happy path, it can assert the transaction's own terminal `STATE` (`SUCCESS`/`FAILED`/`PENDING`) directly, in real time, without waiting on anything from SAP. That assertion is now the **primary** source for `MON_MESSAGE.STATUS` — a real simplification over polling MPL for every message.

The MPL API does not disappear, though — it moves from *primary writer* to **two narrower, specific jobs**, neither of which needs to run per-message on a tight schedule:

1. **Safety-net verification** — periodically compares the already-persisted, Groovy-asserted `STATUS` against SAP's own real MPL status. A mismatch is **flagged, never auto-corrected** (§3.2, §8.4) — Groovy's `STATE` can legitimately encode a different (business) question than MPL's status (technical), so silently overwriting one with the other would just reintroduce the ownership-conflict risk this whole document exists to prevent.
2. **Forensic backfill** — the handful of entities that genuinely have no Groovy equivalent (`Runs`, `ErrorInformation`, `AdapterAttributes`, `MessageStoreEntry`, MPL's own `Attachments`) and the one case where no Groovy runs at all — TPM V2's uninstrumentable standard package (§7.4, §8.5.2).

```text
                         SAP INTEGRATION SUITE
                                  │
                ┌─────────────────┴─────────────────┐
                │                                    │
                ▼                                    ▼
          Business iFlows                      MPL OData API
    (Normal Process / Local Integration               │
     Process / Exception Subprocess —                 │
     Groovy runs at each, §8.1a)                       │
                │                                    │
                ▼                                    │
       Monitoring Groovy                             │
   Assembles events[] from EVENT-NNN                  │
   headers/properties (§8.1a); asserts                │
   the terminal STATE itself — the                    │
   PRIMARY write, not a placeholder                   │
                │                                    │
                ▼                                    │
        Global Data Store                            │
      (SAP CPI buffer, short                         │
       retention, at-least-once)                     │
                │                                    │
                ▼                                    │
      Persistence Framework                          │
   (Central Persistence iFlow:                       │
    batch read → validate →                          │
    transform → write, with its                      │
    own retry/DLQ — see §8.3/8.6)                     │
                │                                     │
                ├──────────── HANA Writer ────────────┤
                │                                     │
                ▼                                     ▼
             SAP HANA  ◄─────────────────  Reconciliation & Forensic
                │                          Backfill Job (§8.4) — lighter,
        ┌───────┼─────────┐                periodic, non-blocking:
        │       │         │                • flags STATUS mismatches
        ▼       ▼         ▼                • backfills Runs/Error/
      Core   Framework  Recovery              Adapter/MessageStore/
     tables   context   tables                Attachments (MPL-only data)
     (§9.1)   tables    (§9.3)              • gap-fills uninstrumented
              (§9.2)                          hops (TPM black box)
                │
                ▼
       Monitoring Backend
    (existing Real/Mock SDK
     provider pattern, §8.7)
                │
      ┌─────────┼──────────┐
      │         │          │
      ▼         ▼          ▼
    MPL       HANA      JMS/TPM
   Provider  Provider   Live APIs
      │         │          │
      └─────────┼──────────┘
                ▼
               UI5
```

**Why Groovy is primary, and why a (much lighter) reconciliation job still matters:** a naive read of "Groovy is present at every outcome" would conclude MPL involvement can be eliminated entirely. Two real gaps stop that from being safe: (1) Groovy's assertion can be wrong — if the last Groovy step runs *before* the actual receiver/adapter call and that call then fails, the asserted `STATE` is stale and nothing corrects it unless something eventually checks; (2) Groovy sometimes never runs at all — an infrastructure-level failure (adapter timeout, worker crash, an exception that bypasses even the exception subprocess) means no `EVENT-*` trail and no `STATE` exist for that message. Both gaps are handled by the same lightweight job (§8.4), scoped narrowly rather than reintroducing a full per-message poll. §3.2 defines exactly which fields each writer is allowed to touch.

---

## 3. Core Design Principles

### 3.1 Three data classes, three owners

**Revised in v1.2**: `STATUS` moves from MPL-authoritative to Groovy-asserted — see §2's rationale. The Reconciliation Job never writes `STATUS` itself; it only writes the two new verification fields below.

| Class | Owner | Examples | Never written by |
|---|---|---|---|
| **Groovy-asserted, MPL-verified** | Monitoring Groovy writes; Reconciliation Job only flags disagreement | `STATUS`, `STATUS_SOURCE`, `EVENT`-derived `events[]` — plus `STATUS_VERIFIED`/`STATUS_DISCREPANCY`, written *only* by the Reconciliation Job | Reconciliation Job never overwrites `STATUS` itself |
| **MPL-exclusive (forensic)** | Reconciliation & Forensic Backfill Job | `LOG_START`/`LOG_END`/`SENDER`/`RECEIVER` (when Groovy didn't capture them), runs, error information, adapter attributes, MPL attachments | Groovy, Recovery API |
| **Framework-owned** | Monitoring Groovy / detection engine | `FRAMEWORK_TYPE`, `FAILURE_*`, queue resolution, TPM interchange context, router/status-sync context | Reconciliation Job |
| **Portal-owned** | Recovery API / operator action | `RECOVERY_STATUS`, `RETRY_COUNT`, `MANUAL_FRAMEWORK`, `MANUAL_QUEUE` | Groovy, Reconciliation Job |
| **Developer-declared** | Written by Groovy, but the *value* is a developer's design decision (SOP block) | `SOP_CONFIGURATION_ID`, `BUSINESS_DOMAIN`, `CRITICALITY`, `UPSTREAM_ALREADY_CAPTURED` | Reconciliation Job, Recovery API |

### 3.2 Field ownership matrix

This is the contract that prevents a MERGE from one writer silently overwriting good data from another with `NULL`. Every writer **only ever updates its own columns** — never a whole row. "MPL Collector" from v1.1 is renamed **Reconciliation Job** throughout to match its narrowed role (§2, §8.4): it verifies and backfills, it does not own `STATUS`.

| Field / Data | Groovy | Reconciliation Job | Recovery API | Authority |
|---|---|---|---|---|
| `MESSAGE_ID` | Create | Read | Read | System |
| `MPL_ID` | Read (once known) | Write | Read | System (correlates Groovy's row to its MPL entry) |
| `CORRELATION_ID` | Write | Read | Read | Groovy (already visible in-flight via standard/custom headers) |
| `STATUS` / `STATUS_SOURCE` | **Write** (`GROOVY_ASSERTED`) | Read only — never overwrites | Read | **Groovy** |
| `STATUS_VERIFIED` / `STATUS_DISCREPANCY` | — | **Write** | Read | Reconciliation Job (flag only, §8.4) |
| `LOG_START` / `LOG_END` | Write (own wall-clock capture) | Write (fills gaps only, e.g. TPM hop 2) | Read | Groovy where present, else Reconciliation Job |
| `SENDER` / `RECEIVER` | Write (from standard headers already visible to Groovy) | Write (fills gaps only) | Read | Groovy where present, else Reconciliation Job |
| `INTEGRATION_FLOW_NAME` / `INTEGRATION_PACKAGE_*` / `ARTIFACT_VERSION` | Write | Write (fills gaps only) | Read | Groovy where present, else Reconciliation Job |
| `LOG_LEVEL` / `CUSTOM_STATUS` | Write | Write (fills gaps only) | Read | Groovy where present, else Reconciliation Job |
| `LAST_ERROR_STEP` / `LAST_SUCCESSFUL_STEP` / `PROCESSING_STARTED` / `PROCESSING_COMPLETED` | Write (live) | — | Read | Groovy |
| Runs, error information, adapter attributes, MPL attachments | — | Write | Read | MPL-exclusive — Groovy has no visibility into these at all |
| `ENVIRONMENT` / `REGION` / `TENANT_NAME` / `TENANT_URL` | Write | Read | Read | Groovy (config-derived, set once) |
| `FRAMEWORK_TYPE`, `FRAMEWORK_DETECTED_BY`, `FRAMEWORK_CONFIDENCE` | Write | Read | Read | Framework |
| `FAILURE_DETECTED` / `FAILURE_CLASSIFICATION` / `FAILURE_SEVERITY` / `FAILURE_ACTIONABLE` / `FAILURE_CONFIDENCE` / `FAILURE_REASON` | Write | Read | Read | Framework |
| `SOP_CONFIGURATION_ID` / `BUSINESS_DOMAIN` / `BUSINESS_PROCESS` / `SUPPORT_TEAM` / `SUPPORT_CONTACT` / `CRITICALITY` / `EXPECTED_PROCESSING_TYPE` | Write | Read | Read | Developer (via Groovy) |
| `UPSTREAM_ALREADY_CAPTURED` / `UPSTREAM_CAPTURE_CONFIRMATION_HEADER` | Write | Read | Read | Developer (via Groovy) |
| Framework context tables (§9.2) | Write | Read | Write *during recovery* | Framework / Recovery |
| `RECOVERY_STATUS`, `RETRY_COUNT`, `RECOVERY_METHOD` | Read | Read | Write | Recovery |
| `MANUAL_FRAMEWORK`, `MANUAL_QUEUE` | Read | Read | Write | Recovery |
| `PERSISTENCE_STATUS` | Write (initial) | Read | — | Persistence Framework (§8.6) |
| `MON_MESSAGE_DATA_SOURCE` rows (`audit.dataSources[]`) | Write (append own) | Write (append own) | Write (append own) | Every writer appends its own row; never deletes another's |

**MERGE rule:** never let a `NULL` from one writer erase a value owned by another. In SQL terms every UPSERT uses `COALESCE(source.col, target.col)` for columns outside the writer's own ownership set, or — cleaner — the writer's UPDATE statement simply never names a column it does not own. The `STATUS` row above is the sharpest example of this rule in the whole document: the Reconciliation Job is explicitly forbidden from writing it under any circumstances, even when it disagrees — see §10 for the concrete UPSERT pattern.

### 3.3 One canonical identity, many hops

A business transaction is not one MPL entry. It is a **chain** of MPL entries sharing one `CORRELATION_ID`, each captured as its own row in `MON_MESSAGE`. This matters most for TPM V2, where SAP's own standard package is a black box between a custom entrance flow and a custom receiver flow — see §7.3–7.8 and §8.5.2 for the full worked chain.

```text
                    MON_MESSAGE  (one row per hop)
                         │
          ┌──────────────┼───────────────┐
          │              │               │
          ▼              ▼               ▼
      Payloads        Headers         Properties
          │
          ├────────── Attachments
          ├────────── Failure Evidence
          ├────────── Events
          ├────────── Data Sources (audit)
          │
          ▼
    Framework Context (one row per hop, per framework table)
          │
          ▼
    Recovery Context (current state) + Recovery Operation (history)
```

### 3.4 Never fabricate

Every field is one of: **real** (read from MPL or the tenant), a **documented heuristic** (derived, explicitly labeled), or a **reserved extension point** (`NULL` with a reason, never invented). A framework that cannot be determined is `UNKNOWN` with evidence explaining why — never guessed. This mirrors the same rule already enforced in the portal's Operations Engine and is non-negotiable here too.

---

## 4. The Canonical JSON Envelope

Every Groovy-emitted record — regardless of framework — is one `MONITORING_TRANSACTION` document with this top-level shape. Framework-specific detail lives only inside `framework.context` (§5); everything else is framework-agnostic. Every block below has its own field table, with a **DB Target** column stating exactly which table/column it decomposes into — where a field is intentionally *not* persisted (policy/config that only governs Groovy's own behavior), that is stated explicitly rather than left ambiguous.

```text
MONITORING_TRANSACTION
├── schemaVersion, recordType
├── message            (M — hop identity, MPL linkage)          §4.1
├── environment         (M — tenant/env)                        §4.2
├── integration          (M — iFlow/package/sender/receiver)    §4.3
├── monitoring           (O — MPL-facing diagnostic summary)    §4.4
├── sop                 (M — operational policy)                §4.5
├── framework            (M — type + polymorphic context, §5)  §4.6
├── payloads[]           (C — per policy)                       §4.7
├── headers[]            (O — array, never named object keys)   §4.8
├── properties[]          (O — array, never named object keys)  §4.9
├── failureEvidence[]     (C — required when failure.detected)  §4.10
├── failure              (M — classification)                   §4.11
├── attachments[]         (O)                                   §4.12
├── events[]              (O)                                   §4.13
├── recovery              (M — condition axis, independent      §4.14
│                              of framework)
├── audit                 (S — data source provenance)          §4.15
└── persistence            (S — Persistence Framework only)     §4.16
```

**Convention key** — M = mandatory, C = conditionally mandatory, O = optional, S = system-generated.

### 4.1 `message`

**Revised in v1.2** — `status`/`statusSource` are now Groovy-primary (§2); `statusVerified`/`statusDiscrepancy` are new fields the Reconciliation Job writes.

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `messageId` | string(36) | M | Groovy | `MON_MESSAGE.MESSAGE_ID` (PK) | UUID, generated once per hop |
| `mplId` | string | C | Reconciliation Job | `MON_MESSAGE.MPL_ID` | `NULL` until the Reconciliation Job correlates this row to its MPL entry |
| `correlationId` | string | M | Groovy | `MON_MESSAGE.CORRELATION_ID` | Links every hop of one transaction — already visible to Groovy in-flight |
| `businessTransactionId` | string | O | Developer | `MON_MESSAGE.BUSINESS_TRANSACTION_ID` | PO/order number etc. |
| `parentMessageId` | string | O | Groovy | `MON_MESSAGE.PARENT_MESSAGE_ID` | Explicit parent hop, when known at capture time |
| `hopSequence` | int | C | Groovy | `MON_MESSAGE.HOP_SEQUENCE` | Required for any framework with >1 hop (TPM) |
| `hopName` | string | C | Developer | `MON_MESSAGE.HOP_NAME` | Free text, e.g. `TPM_ENTRANCE` |
| `hopType` | enum | C | Developer | `MON_MESSAGE.HOP_TYPE` | `ENTRANCE`\|`INTERNAL_HANDOFF`\|`EXIT`\|`STANDALONE` |
| `capturedBy` | enum | M | System | `MON_MESSAGE.CAPTURED_BY` | `GROOVY_RUNTIME`\|`MPL_COLLECTOR_ONLY` — the latter only for uninstrumented hops (TPM black box, §7.4), see §3.3 |
| `status` | string | M | **Groovy** | `MON_MESSAGE.STATUS` | The developer-maintained `STATE` constant (§8.1a) — a project-defined vocabulary (`SUCCESS`\|`FAILED`\|`PENDING`, extensible), not a copy of SAP's own MPL status string |
| `statusSource` | enum | M | System | `MON_MESSAGE.STATUS_SOURCE` | `GROOVY_ASSERTED` (the normal case) \| `MPL_COLLECTOR_ONLY` (only for hop-2-style gap-fill rows with no Groovy at all) |
| `statusVerified` | boolean | S | Reconciliation Job | `MON_MESSAGE.STATUS_VERIFIED` | `false` until the periodic safety-net check has actually compared this row against real MPL status |
| `statusDiscrepancy` | string | O | Reconciliation Job | `MON_MESSAGE.STATUS_DISCREPANCY` | `NULL` when verified-and-matching or not yet verified; populated only on a real mismatch — `STATUS` itself is never touched (§3.2) |
| `createdAt` | timestamp | M | Groovy | `MON_MESSAGE.LOG_START` | Groovy's own wall-clock capture — already visible in-flight, no MPL wait needed |
| `completedAt` | timestamp | O | Groovy | `MON_MESSAGE.LOG_END` | |
| `processingTimeMs` | int | O | derived | `MON_MESSAGE.PROCESSING_TIME_MS` | |

### 4.2 `environment`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `name` | string | M | Groovy (config) | `MON_MESSAGE.ENVIRONMENT` | DEV/QA/PRD |
| `tenantName` | string | M | Groovy (config) | `MON_MESSAGE.TENANT_NAME` | |
| `tenantUrl` | string | O | Groovy (config) | `MON_MESSAGE.TENANT_URL` | |
| `region` | string | O | Groovy (config) | `MON_MESSAGE.REGION` | e.g. `US10` |

### 4.3 `integration`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `packageName` | string | O | MPL | `MON_MESSAGE.INTEGRATION_PACKAGE_NAME` | |
| `flowName` | string | M | MPL | `MON_MESSAGE.INTEGRATION_FLOW_NAME` | |
| `artifactVersion` | string | O | MPL | `MON_MESSAGE.ARTIFACT_VERSION` | |
| `sender` | string | O | MPL | `MON_MESSAGE.SENDER` | |
| `receiver` | string | O | MPL | `MON_MESSAGE.RECEIVER` | |
| `senderAdapter` | string | O | MPL | `MON_MESSAGE.SENDER_ADAPTER` | |
| `receiverAdapter` | string | O | MPL | `MON_MESSAGE.RECEIVER_ADAPTER` | |
| `messageType` | string | O | MPL | `MON_MESSAGE.MESSAGE_TYPE` | |
| `applicationId` | string | O | MPL/Groovy | `MON_MESSAGE.APPLICATION_ID` | |

### 4.4 `monitoring`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `source` | string | O | Groovy | *Not persisted* | Constant `"SAP_CPI"` in v1 — reserved multi-source extension point, same reasoning as `statusSource` |
| `sourceType` | string | O | Groovy | *Not persisted* | Constant `"MPL"` in v1 |
| `logLevel` | string | O | Groovy | `MON_MESSAGE.LOG_LEVEL` | |
| `customStatus` | string | O | Groovy | `MON_MESSAGE.CUSTOM_STATUS` | |
| `lastErrorStep` | string | O | Groovy | `MON_MESSAGE.LAST_ERROR_STEP` | The `EVENT-NNN` trail (§8.1a) already names the last step that ran — no MPL wait needed |
| `lastSuccessfulStep` | string | O | Groovy | `MON_MESSAGE.LAST_SUCCESSFUL_STEP` | |
| `processingStarted` | boolean | O | Groovy | `MON_MESSAGE.PROCESSING_STARTED` | |
| `processingCompleted` | boolean | O | Groovy | `MON_MESSAGE.PROCESSING_COMPLETED` | |

### 4.5 `sop`

Governs what a hop should capture and who to notify — mostly developer-declared, written into the envelope by Groovy. Fields that only steer Groovy's own in-flight behavior (allow-lists, capture toggles) are **not** persisted per transaction — persisting them per row would be exactly the static-data-duplicated-per-row anti-pattern already ruled out for DLQ topology (§6.2). Their *effect* is already visible in which `MON_PAYLOAD`/`MON_HEADER`/`MON_PROPERTY` rows actually exist.

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `configurationId` | string | O | Developer | `MON_MESSAGE.SOP_CONFIGURATION_ID` | Which config drove this hop's detection/policy |
| `monitoringEnabled` | boolean | M | Developer | *Not persisted* | Gate — `false` means Groovy should not emit a record at all |
| `businessDomain` | string | O | Developer | `MON_MESSAGE.BUSINESS_DOMAIN` | |
| `businessProcess` | string | O | Developer | `MON_MESSAGE.BUSINESS_PROCESS` | |
| `supportTeam` | string | O | Developer | `MON_MESSAGE.SUPPORT_TEAM` | |
| `supportContact` | string | O | Developer | `MON_MESSAGE.SUPPORT_CONTACT` | |
| `criticality` | enum | O | Developer | `MON_MESSAGE.CRITICALITY` | `LOW`\|`MEDIUM`\|`HIGH`\|`CRITICAL` |
| `expectedProcessingType` | enum | O | Developer | `MON_MESSAGE.EXPECTED_PROCESSING_TYPE` | `SYNCHRONOUS`\|`ASYNCHRONOUS` |
| `recoverySupported` | boolean | O | Developer | *Not persisted* | Informs `recovery.status` defaulting only |
| `manualRecoverySupported` | boolean | O | Developer | *Not persisted* | |
| `maxRecoveryAttempts` | int | O | Developer | `MON_RECOVERY_CONTEXT.MAX_RETRIES` | |
| `payloadPolicy.captureStartingPayload` etc. (5 booleans) | boolean | O | Developer | *Not persisted* | Governs Groovy's own capture behavior only |
| `payloadPolicy.maxPayloadSizeBytes` / `.truncateOversizedPayload` | int/bool | O | Developer | *Not persisted* | Same |
| `payloadPolicy.upstreamAlreadyCaptured` | boolean | O | Developer | `MON_MESSAGE.UPSTREAM_ALREADY_CAPTURED` | Per-transaction fact, not static policy — persisted (§8.5.1) |
| `payloadPolicy.upstreamCaptureConfirmationHeader` | string | O | Developer | `MON_MESSAGE.UPSTREAM_CAPTURE_CONFIRMATION_HEADER` | |
| `alertPolicy.*` | object | O | Developer | *Not persisted* | Out of scope — backed by the portal's existing alerting config, not this schema |
| `businessIdentifiers[]` / `headerAllowList[]` / `propertyAllowList[]` | array | O | Developer | *Not persisted* | Governs which `properties[]`/`headers[]` entries Groovy captures |

### 4.6 `framework` (envelope level)

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `type` | enum | M | Framework | `MON_MESSAGE.FRAMEWORK_TYPE` | `TPM_V2`\|`JMS_FRAMEWORK`\|`COMMON_IDOC_ROUTER`\|`IDOC_STATUS_SYNC`\|`NON_FRAMEWORK`\|`UNKNOWN` |
| `detectedBy` | enum | M | Framework | `MON_MESSAGE.FRAMEWORK_DETECTED_BY` | `CONFIGURATION`\|`QUEUE_EVIDENCE`\|`MPL_COLLECTOR_RECONCILIATION`\|`MANUAL` |
| `confidence` | enum | M | Framework | `MON_MESSAGE.FRAMEWORK_CONFIDENCE` | `HIGH`\|`PROBABLE`\|`NONE` |
| `context` | object | C | Framework | One of the §9.2 context tables | Polymorphic on `type` — see §5 |

### 4.7 `payloads[]`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `payloadId` | string(36) | M | Groovy | `MON_PAYLOAD.PAYLOAD_ID` (PK) | App-generated, idempotency key |
| `type` | enum | M | Groovy | `MON_PAYLOAD.PAYLOAD_TYPE` | `STARTING`\|`REQUEST`\|`RESPONSE`\|`ERROR`\|`INTERCHANGE`\|`TRANSFORMED`\|`ATTACHMENT`\|`FINAL_REQUEST` |
| `stage` | string | O | Groovy | `MON_PAYLOAD.STAGE_NAME` | |
| `direction` | string | O | Groovy | `MON_PAYLOAD.DIRECTION` | |
| `description` | string | O | Groovy | `MON_PAYLOAD.DESCRIPTION` | |
| `mimeType` / `encoding` / `compression` | string | O | Groovy | `MON_PAYLOAD.MIME_TYPE` / `.ENCODING` / `.COMPRESSION` | |
| `sizeBytes` / `originalSizeBytes` | int | O | Groovy | `MON_PAYLOAD.SIZE_BYTES` / `.ORIGINAL_SIZE_BYTES` | |
| `storedSizeBytes` | int | S | DB | `MON_PAYLOAD.STORED_SIZE_BYTES` | Computed at persist time, not sent by Groovy |
| `isTruncated` | boolean | M | Groovy | `MON_PAYLOAD.IS_TRUNCATED` | Never silently truncate without this flag (§9 note) |
| `representation` | enum | M | Groovy | `MON_PAYLOAD.REPRESENTATION` | `TEXT`\|`BINARY` |
| `content` / `binaryContent` | string | C | Groovy | `MON_PAYLOAD.PAYLOAD_TEXT` / `.PAYLOAD_BINARY` | Exactly one populated, per `representation` |
| `capturedAt` | timestamp | M | Groovy | `MON_PAYLOAD.CAPTURED_AT` | |
| `sourceStep` | string | O | Groovy | `MON_PAYLOAD.SOURCE_STEP` | |
| `targetReceiver` | string | O | Groovy | `MON_PAYLOAD.TARGET_RECEIVER` | |

### 4.8 `headers[]`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `name` | string | M | Groovy | `MON_HEADER.HEADER_NAME` (PK, with `MESSAGE_ID`) | |
| `value` | string | O | Groovy | `MON_HEADER.HEADER_VALUE` | |
| `category` | enum | O | Groovy | `MON_HEADER.CATEGORY` | `SAP`\|`FRAMEWORK`\|`CUSTOM` |
| `source` | string | O | Groovy | `MON_HEADER.SOURCE` | e.g. `CPI_RUNTIME`, `DEVELOPER` |

### 4.9 `properties[]`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `name` | string | M | Groovy | `MON_PROPERTY.PROPERTY_NAME` (PK, with `MESSAGE_ID`) | |
| `value` | string | O | Groovy | `MON_PROPERTY.PROPERTY_VALUE` | |
| `category` | enum | O | Groovy | `MON_PROPERTY.CATEGORY` | `BUSINESS`\|`MONITORING`\|`DEVELOPER_DEFINED` |
| `source` | string | O | Groovy | `MON_PROPERTY.SOURCE` | |

### 4.10 `failureEvidence[]`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `evidenceId` | string(36) | M | Groovy | `MON_FAILURE_EVIDENCE.EVIDENCE_ID` (PK) | App-generated |
| `type` | string | M | Groovy | `MON_FAILURE_EVIDENCE.EVIDENCE_TYPE` | e.g. `ADAPTER`, `CAMEL_EXCEPTION`, `ROUTING` |
| `name` | string | M | Groovy | `MON_FAILURE_EVIDENCE.EVIDENCE_NAME` | |
| `value` | string | O | Groovy | `MON_FAILURE_EVIDENCE.EVIDENCE_VALUE` | |
| `source` | string | O | Groovy | `MON_FAILURE_EVIDENCE.SOURCE` | |

### 4.11 `failure`

Groovy's own live classification, distinct from MPL's own structured `MON_ERROR` entity (§9.1) and from the raw evidence trail above — this is the *conclusion*, evidence is the *reasoning*.

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `detected` | boolean | M | Framework | `MON_MESSAGE.FAILURE_DETECTED` | |
| `classification` | enum | C | Framework | `MON_MESSAGE.FAILURE_CLASSIFICATION` | `TECHNICAL`\|`BUSINESS`\|`ROUTING` |
| `severity` | enum | C | Framework | `MON_MESSAGE.FAILURE_SEVERITY` | `LOW`\|`MEDIUM`\|`HIGH`\|`CRITICAL` |
| `actionable` | boolean | C | Framework | `MON_MESSAGE.FAILURE_ACTIONABLE` | |
| `confidence` | enum | C | Framework | `MON_MESSAGE.FAILURE_CONFIDENCE` | `HIGH`\|`MEDIUM`\|`LOW` — distinct from `framework.confidence` |
| `reason` | string | C | Framework | `MON_MESSAGE.FAILURE_REASON` | |

### 4.12 `attachments[]`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `attachmentId` | string(36) | M | Groovy | `MON_ATTACHMENT.ATTACHMENT_ID` (PK) | |
| `name` | string | M | Groovy | `MON_ATTACHMENT.NAME` | |
| `contentType` | string | O | Groovy | `MON_ATTACHMENT.CONTENT_TYPE` | |
| `sizeBytes` | int | O | Groovy | `MON_ATTACHMENT.SIZE_BYTES` | |
| `available` | boolean | M | Groovy | `MON_ATTACHMENT.AVAILABLE` | Reference exists even when content wasn't inlined |
| `isTruncated` | boolean | O | Groovy | `MON_ATTACHMENT.IS_TRUNCATED` | |
| content (text/binary) | string | C | Groovy | `MON_ATTACHMENT.CONTENT_TEXT` / `.CONTENT_BINARY` | |

### 4.13 `events[]`

**How this array is actually built (v1.2, §8.1a):** a CPI Script step is a fresh execution context each time it runs — nothing held in a script variable survives from one Groovy step to the next, let alone across a Normal Process / Local Integration Process / Exception Subprocess boundary. Only **message headers and exchange properties** survive across those boundaries. So `events[]` is never built by appending to an in-memory array; each Groovy touchpoint writes one more `EVENT-NNN`-prefixed header/property (`EVENT-001`, `EVENT-002`, …), and the *final* Groovy step — whichever branch actually executes, success end or exception handler — scans every `EVENT-*` entry, sorts numerically, and assembles this array. Full mechanism in §8.1a.

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `eventId` | string(36) | M | Groovy | `MON_EVENT.EVENT_ID` (PK) | |
| `timestamp` | timestamp | M | Groovy | `MON_EVENT.EVENT_TIME` | |
| `type` | string | M | Groovy | `MON_EVENT.EVENT_TYPE` | Derived from the `EVENT-NNN` header/property's own description |
| `source` | string | O | Groovy | `MON_EVENT.SOURCE` | |
| `flowName` | string | O | Groovy | `MON_EVENT.FLOW_NAME` | |
| `queueName` | string | O | Groovy | `MON_EVENT.QUEUE_NAME` | |
| `oldStatus` / `newStatus` | string | O | Groovy | `MON_EVENT.OLD_STATUS` / `.NEW_STATUS` | |
| `description` | string | O | Groovy | `MON_EVENT.DESCRIPTION` | |

### 4.14 `recovery`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `status` | enum | M | Recovery | `MON_RECOVERY_CONTEXT.RECOVERY_STATUS` | See §4.1's enum list |
| `layer` | enum | C | Recovery/Framework | `MON_RECOVERY_CONTEXT.RECOVERY_LAYER` | `JMS_QUEUE_DLQ`\|`TPM_DLQ`\|`COMMON_ROUTER_DLQ`\|`STATUS_SYNC_DLQ` |
| `currentQueue` / `queueRole` | string/enum | C | Recovery | `MON_RECOVERY_CONTEXT.CURRENT_QUEUE` / `.QUEUE_ROLE` | |
| `sourceQueue` / `targetQueue` | string | C | Recovery | `MON_RECOVERY_CONTEXT.SOURCE_QUEUE` / `.TARGET_QUEUE` | |
| `manualStepRequired` | boolean | C | Framework | `MON_RECOVERY_CONTEXT.MANUAL_STEP_REQUIRED` | `true` for Common Router today (§8.5.3) |
| `retentionGuaranteeDays` | int | O | Framework | `MON_RECOVERY_CONTEXT.RETENTION_GUARANTEE_DAYS` | e.g. `7` |
| `retryCount` / `maxRetries` | int | C | Recovery | `MON_RECOVERY_CONTEXT.RETRY_COUNT` / `.MAX_RETRIES` | |
| `manualQueue` | string | O | Recovery | `MON_RECOVERY_CONTEXT.MANUAL_QUEUE` | Operator-supplied fallback (JMS §6.1) |
| `recoveryMethod` | string | O | Recovery | `MON_RECOVERY_CONTEXT.RECOVERY_METHOD` | Resolved plan preview, e.g. `JMS_MESSAGE_MOVE` |
| `discoveryMethod` | string | O | Framework | `MON_RECOVERY_CONTEXT.DISCOVERY_METHOD` | e.g. `MPL_CUSTOM_HEADER` |
| `lastOperationId` | string | O | Recovery | `MON_RECOVERY_CONTEXT.LAST_OPERATION_ID` | FK-by-value into `MON_RECOVERY_OPERATION` |

### 4.15 `audit`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `dataSources[]` | array of string | S | Every writer | `MON_MESSAGE_DATA_SOURCE` (child table) | Each writer appends its own row (`CPI_GROOVY`, `MPL_API`, `FRAMEWORK`, `RECOVERY_ENGINE`) — array shape in JSON, one row per source in DB, matching the `MON_HEADER`/`MON_PROPERTY` pattern |

### 4.16 `persistence`

| Path | Type | Req. | Owner | DB Target | Notes |
|---|---|---|---|---|---|
| `status` | enum | S | Persistence Framework | `MON_MESSAGE.PERSISTENCE_STATUS` | Current state; full attempt history in `MON_PERSISTENCE_OPERATION` (§9.4) |

---

## 5. Framework Context Shapes

`framework.context` is polymorphic on `framework.type`. Each shape below maps 1:1 to its own DB table in §9.2 — the JSON transport format mirrors normalized storage rather than flattening everything into one object.

### 5.1 `JMS_FRAMEWORK`

```json
{
  "queueResolution": {
    "resolved": true,
    "queueName": "ORDER_HIGH",
    "queueRole": "MAIN",
    "source": "CUSTOM_HEADER",
    "sourceField": "JMS_QueueName",
    "manualFallbackUsed": false
  }
}
```

Detected via correlation-group flow-name match (`IF_JMS_ingress` + `IF_JMS_egress`), confirmed. Queue resolved from the `CH-Message-Queue`-style custom header written by the framework's egress iFlow. When the header cannot be parsed, `resolved: false` and `manualFallbackUsed` becomes `true` once an operator supplies one via the Recovery API (§6.1).

### 5.2 `TPM_V2`

```json
{
  "interchangeId": "TPM-INT-0001827",
  "senderPartner": "PARTNER_ACME_SUPPLY",
  "receiverPartner": "S4HANA_PROCUREMENT",
  "documentType": "X12_850",
  "processingStage": "MAPPED_EDI_HANDOFF",
  "processingDirection": "OUTBOUND",
  "queueResolution": {
    "strategy": "PAYLOAD_HINT",
    "resolved": true,
    "queueName": "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
    "queueRole": "DLQ",
    "evidenceSource": "TPM_QueueHint property set by TPM v2 standard processing",
    "probedQueues": []
  }
}
```

`queueResolution.strategy` is `PAYLOAD_HINT` when a property/header already carries the queue name (cheap — no probe needed) and `QUEUE_PROBE` when TPM's bounded, four-queue set had to be checked directly (§6.2). `probedQueues[]` is populated only in the latter case, for auditability.

### 5.3 `COMMON_IDOC_ROUTER`

```json
{
  "sndprn": "SHOPIFY",
  "rcvprn": "S4HANA",
  "idoctyp": "ORDERS05",
  "mestyp": "ORDERS",
  "routingStatus": "FAILED",
  "routingError": "No matching SNDPRN/RCVPRN routing rule found in Partner Directory",
  "queueResolution": {
    "strategy": "DLQ_LAYER_PROBE",
    "resolved": true,
    "queueName": "Common_Router_JMS_DLQ",
    "queueRole": "DLQ",
    "probedQueues": [
      { "queueName": "Common_Router_JMS", "found": false },
      { "queueName": "Common_Router_JMS_DLQ", "found": true }
    ]
  }
}
```

No configured detection rule exists for this framework today — it is reached exclusively via `QUEUE_EVIDENCE` (found on one of its two known queues). See §8.5.3 for why its DLQ recovery is manual today.

### 5.4 `IDOC_STATUS_SYNC`

```json
{
  "idocNumber": "900001234567",
  "previousStatus": "03",
  "currentStatus": "51",
  "targetStatus": "06",
  "acknowledgementType": "997",
  "queueResolution": {
    "strategy": "DLQ_LAYER_PROBE",
    "resolved": true,
    "queueName": "Status_JMS_DLQ",
    "queueRole": "DLQ",
    "probedQueues": [
      { "queueName": "Status_JMS", "found": false },
      { "queueName": "Status_JMS_DLQ", "found": true }
    ]
  }
}
```

Structurally identical to Common IDoc Router — two queues, `DLQ_LAYER_PROBE` — but the domain is IDoc status/997 acknowledgment sync, not routing.

### 5.5 `UNKNOWN` / `NON_FRAMEWORK`

```json
{
  "reason": "No configured detection rule matched this message's flow name, correlation group, or queue location",
  "evidenceChecked": ["integrationFlowPatterns", "correlationFlowNames", "queueTopology"],
  "suggestedFramework": null,
  "manualFramework": null,
  "assignedBy": null,
  "assignedAt": null
}
```

`UNKNOWN` (insufficient evidence) and `NON_FRAMEWORK` (evidence positively excludes every known framework) are distinct outcomes — never collapsed into one "unassigned" bucket. A manual assignment updates `manualFramework`/`assignedBy`/`assignedAt` only; `framework.type` itself stays `UNKNOWN` until a real detection pass confirms it, since a manual assignment is an operator's judgment call, not new evidence.

---

## 6. Queue-Finding Strategy Per Framework

The goal in every case is the same: resolve a message's queue **without** an unbounded fan-out of API calls per transaction.

### 6.1 JMS Framework — header lookup + manual fallback

```text
Read CH-Message-Queue-style custom header (written by the framework's own egress iFlow)
   │
   ├─ parseable ──► queue resolved, zero probe calls
   │
   └─ not parseable / absent
          │
          ▼
     Report MANUAL_INVESTIGATION_REQUIRED
     Operator supplies queue via Recovery API
          │
          ▼
     recovery ...manualFallbackUsed = true, queueResolution recorded for audit
```

One header read, zero-or-one probe. This is already implemented in the portal's `JmsFrameworkRecoveryStrategy` and generalizes directly to the persistence layer: the same resolution logic should run once (in Groovy or in the framework detection engine) and its *result* gets persisted — never re-derived per read.

### 6.2 TPM V2 — payload hint first, bounded probe second

TPM has exactly four queues in play (`SAP_TPM_INBOUND_Q`, `SAP_TPM_OUTBOUND_Q`, and their two paired DLQs), so an unbounded search is never necessary:

```text
Check payload / MPL property for an existing queue hint
  (TPM's own standard processing frequently already knows
   which queue it used — no reason to re-discover it)
   │
   ├─ hint present ──► use it directly (PAYLOAD_HINT strategy, 0 API calls)
   │
   └─ hint absent
          │
          ▼
     Probe the bounded set, stopping at first hit
     (QUEUE_PROBE strategy, ≤4 keyed lookups):
        SAP_TPM_INBOUND_Q
        SAP_TPM_OUTBOUND_Q
        SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q
        SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q
          │
          ▼
     Not found on any ──► NOT_FOUND (expired / deleted / already processed)
```

Because the DLQ→target mapping is *static topology* (processing DLQ always recovers to inbound; receiver DLQ always recovers to outbound), that mapping is **configuration, not per-transaction data** — it is looked up at read/recovery time, never written into every transaction record. Storing it per-row would just move the duplication problem discussed earlier from "two JSON paths" to "every row that hits the same DLQ."

### 6.3 Common IDoc Router / IDoc Status Sync — two-queue DLQ-layer probe

Both frameworks have exactly two queues each (main + DLQ), so the strategy is a fixed, 2-call-maximum probe:

```text
Probe main queue ──► found: MAIN, done (1 call)
   │
   └─ not found
          │
          ▼
     Probe DLQ ──► found: DLQ, done (2 calls total)
          │
          └─ not found ──► NOT_FOUND
```

Identical shape for both frameworks; only the queue names differ (`Common_Router_JMS`/`Common_Router_JMS_DLQ` vs `Status_JMS`/`Status_JMS_DLQ`).

---

## 7. Worked JSON Examples

Every framework's complete envelope, in full — no field trimmed, no block omitted — so a Groovy developer can copy the shape directly and a DB reviewer can trace every path to its column without cross-referencing another example.

### 7.1 JMS Framework — Common Router + JMS + Custom Exit

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "jms-msg-0001",
    "mplId": "MPL-JMS-CUSTOMEXIT-001",
    "correlationId": "JMS-CORR-20260812-3301",
    "businessTransactionId": "1000456",
    "parentMessageId": null,
    "hopSequence": 1,
    "hopName": "JMS_INGRESS_WITH_CUSTOM_EXIT",
    "hopType": "STANDALONE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "FAILED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T10:00:00Z",
    "completedAt": "2026-08-12T10:00:05Z",
    "processingTimeMs": 4820
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "Common Router + JMS",
    "flowName": "JMS_Ingress_With_Custom_Exit",
    "artifactVersion": "1.2.0",
    "sender": "SAP_IDoc_Source",
    "receiver": "ORDER_HIGH_Consumer",
    "senderAdapter": "IDOC",
    "receiverAdapter": "JMS",
    "messageType": "ORDERS",
    "applicationId": "COMMON_ROUTER"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "ERROR",
    "customStatus": "BUSINESS_ERROR",
    "lastErrorStep": "Send_To_JMS_Queue",
    "lastSuccessfulStep": "Custom_Exit_Mapping",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "JMS-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "ORDER_MANAGEMENT",
    "businessProcess": "CUSTOMER_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": true,
      "captureFinalRequestPayload": true,
      "captureResponsePayload": false,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": true,
      "upstreamCaptureConfirmationHeader": "X-Entrance-Payload-Captured"
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["OrderNumber", "SalesDocument"],
    "headerAllowList": ["JMS_QueueName", "JMS_MessageId", "JMS_RetryCount", "X-Custom-Exit-Applied"],
    "propertyAllowList": ["OrderNumber", "RetryCounter"]
  },

  "framework": {
    "type": "JMS_FRAMEWORK",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "queueResolution": {
        "resolved": true,
        "queueName": "ORDER_HIGH",
        "queueRole": "MAIN",
        "source": "CUSTOM_HEADER",
        "sourceField": "JMS_QueueName",
        "manualFallbackUsed": false
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-JMS-001",
      "type": "TRANSFORMED",
      "stage": "CUSTOM_EXIT_MAPPING",
      "direction": "INBOUND",
      "description": "Payload after custom-exit XSL mapping via Partner Directory binary parameter",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 6200,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<MappedOrder><OrderNumber>1000456</OrderNumber></MappedOrder>",
      "capturedAt": "2026-08-12T10:00:02Z",
      "sourceStep": "Custom_Exit_Mapping"
    }
  ],

  "headers": [
    { "name": "JMS_QueueName", "value": "ORDER_HIGH", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "X-Custom-Exit-Applied", "value": "true", "category": "CUSTOM", "source": "FRAMEWORK_RUNTIME" },
    { "name": "X-Entrance-Payload-Captured", "value": "true", "category": "CUSTOM", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "OrderNumber", "value": "1000456", "category": "BUSINESS", "source": "DEVELOPER" },
    { "name": "RetryCounter", "value": "0", "category": "MONITORING", "source": "FRAMEWORK" }
  ],

  "failureEvidence": [
    { "evidenceId": "EVID-JMS-001", "type": "ADAPTER", "name": "JMS_SendFailure", "value": "Queue capacity exceeded", "source": "CPI_RUNTIME" }
  ],

  "failure": {
    "detected": true,
    "classification": "TECHNICAL",
    "severity": "HIGH",
    "actionable": true,
    "confidence": "HIGH",
    "reason": "JMS send failed: ORDER_HIGH queue capacity exceeded"
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-JMS-001", "timestamp": "2026-08-12T10:00:01Z", "type": "CUSTOM_EXIT_APPLIED", "source": "FRAMEWORK_RUNTIME" },
    { "eventId": "EVT-JMS-002", "timestamp": "2026-08-12T10:00:05Z", "type": "FAILED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "RECOVERABLE",
    "layer": "JMS_QUEUE_DLQ",
    "currentQueue": "Common_JMS_ID_DLQ",
    "queueRole": "DLQ",
    "sourceQueue": "Common_JMS_ID_DLQ",
    "targetQueue": "ORDER_HIGH",
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": 0,
    "maxRetries": 5,
    "manualQueue": null,
    "recoveryMethod": "JMS_MESSAGE_MOVE",
    "discoveryMethod": "MPL_CUSTOM_HEADER",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.2 JMS Framework — Common Router + JMS + No Custom Exit

Same topology, minus the custom-exit branch: no exit-related header/event, the entrance payload is captured directly by this hop (no upstream-capture handoff), and the message resolves cleanly to its main queue instead of failing.

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "jms-msg-0002",
    "mplId": "MPL-JMS-NOEXIT-001",
    "correlationId": "JMS-CORR-20260812-3302",
    "businessTransactionId": "1000457",
    "parentMessageId": null,
    "hopSequence": 1,
    "hopName": "JMS_INGRESS_NO_CUSTOM_EXIT",
    "hopType": "STANDALONE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "COMPLETED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T10:05:00Z",
    "completedAt": "2026-08-12T10:05:02Z",
    "processingTimeMs": 1980
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "Common Router + JMS",
    "flowName": "JMS_Ingress_No_Custom_Exit",
    "artifactVersion": "1.2.0",
    "sender": "SAP_IDoc_Source",
    "receiver": "ORDER_HIGH_Consumer",
    "senderAdapter": "IDOC",
    "receiverAdapter": "JMS",
    "messageType": "ORDERS",
    "applicationId": "COMMON_ROUTER"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": "Send_To_JMS_Queue",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "JMS-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "ORDER_MANAGEMENT",
    "businessProcess": "CUSTOMER_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": true,
      "captureResponsePayload": false,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["OrderNumber"],
    "headerAllowList": ["JMS_QueueName", "JMS_MessageId"],
    "propertyAllowList": ["OrderNumber"]
  },

  "framework": {
    "type": "JMS_FRAMEWORK",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "queueResolution": {
        "resolved": true,
        "queueName": "ORDER_HIGH",
        "queueRole": "MAIN",
        "source": "CUSTOM_HEADER",
        "sourceField": "JMS_QueueName",
        "manualFallbackUsed": false
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-JMS-002",
      "type": "STARTING",
      "stage": "INGRESS",
      "direction": "INBOUND",
      "description": "Entrance payload captured directly (no upstream capture, no custom exit)",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 5400,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<ORDERS05><IDOC>...</IDOC></ORDERS05>",
      "capturedAt": "2026-08-12T10:05:00Z",
      "sourceStep": "JMS_Ingress_No_Custom_Exit"
    }
  ],

  "headers": [
    { "name": "JMS_QueueName", "value": "ORDER_HIGH", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "JMS_MessageId", "value": "ID-887711223", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "OrderNumber", "value": "1000457", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-JMS-003", "timestamp": "2026-08-12T10:05:02Z", "type": "COMPLETED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": "ORDER_HIGH",
    "queueRole": "MAIN",
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": 0,
    "maxRetries": 5,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": "MPL_CUSTOM_HEADER",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

---

### TPM V2 — the full hop chain

One interchange, one `correlationId`, five hops (`hopSequence` 1–5). §8.5.2 explains why hop 2 is structurally different from every other example in this document — it is the one place SAP's own standard package cannot be instrumented at all.

### 7.3 TPM V2 — Hop 1: `TPM_ENTRANCE`

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0001",
    "mplId": "MPL-TPM-ENTRANCE-001",
    "correlationId": "TPM-CORR-20260812-01827",
    "businessTransactionId": "PO-0004521",
    "parentMessageId": null,
    "hopSequence": 1,
    "hopName": "TPM_ENTRANCE",
    "hopType": "ENTRANCE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "COMPLETED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:00:00Z",
    "completedAt": "2026-08-12T09:00:01Z",
    "processingTimeMs": 850
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "TPM Interchange Processing",
    "flowName": "TPM_Entrance_Capture",
    "artifactVersion": "1.0.0",
    "sender": "PARTNER_ACME_SUPPLY",
    "receiver": "S4HANA_PROCUREMENT",
    "senderAdapter": "AS2",
    "receiverAdapter": "TPM_V2_STANDARD",
    "messageType": "X12_850",
    "applicationId": "TPM_EDI_GATEWAY"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": "Entrance_Capture",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "TPM-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "PROCUREMENT",
    "businessProcess": "PURCHASE_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": true,
      "captureFinalRequestPayload": true,
      "captureResponsePayload": true,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["PurchaseOrderNumber", "InterchangeId"],
    "headerAllowList": ["TPM_InterchangeId", "TPM_DocumentType"],
    "propertyAllowList": ["PurchaseOrderNumber"]
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "interchangeId": "TPM-INT-0001827",
      "senderPartner": "PARTNER_ACME_SUPPLY",
      "receiverPartner": "S4HANA_PROCUREMENT",
      "documentType": "X12_850",
      "processingStage": "ENTRANCE",
      "processingDirection": "INBOUND",
      "queueResolution": null
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-TPM-001",
      "type": "STARTING",
      "stage": "INBOUND",
      "direction": "INBOUND",
      "description": "Original EDI payload as received from the partner",
      "mimeType": "application/edi-x12",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 4210,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "ISA*00*...~ST*850*0001~PO1*1*10*EA*...~SE*...~",
      "capturedAt": "2026-08-12T09:00:00Z",
      "sourceStep": "TPM_Entrance_Capture"
    }
  ],

  "headers": [
    { "name": "TPM_InterchangeId", "value": "TPM-INT-0001827", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "PurchaseOrderNumber", "value": "PO-0004521", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-TPM-001", "timestamp": "2026-08-12T09:00:01Z", "type": "RECEIVED", "source": "CPI" }
  ],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": null,
    "queueRole": null,
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": null,
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.4 TPM V2 — Hop 2: `TPM_V2_STANDARD_PROCESSING` (the black box)

No Groovy ever ran here. Every field that would normally come from Groovy/the framework/developer/recovery layers is honestly absent — that absence is correct, not a defect. This record only exists because the Reconciliation & Forensic Backfill Job (§8.4, Job B) found an MPL entry Groovy never saw.

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0002",
    "mplId": "MPL-TPM-STD-002",
    "correlationId": "TPM-CORR-20260812-01827",
    "businessTransactionId": null,
    "parentMessageId": null,
    "hopSequence": 2,
    "hopName": "TPM_V2_STANDARD_PROCESSING",
    "hopType": "INTERNAL_HANDOFF",
    "capturedBy": "MPL_COLLECTOR_ONLY",
    "status": "COMPLETED",
    "statusSource": "MPL_COLLECTOR_ONLY",
    "statusVerified": true,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:00:01Z",
    "completedAt": "2026-08-12T09:00:03Z",
    "processingTimeMs": 2100
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "SAP TPM V2 Standard",
    "flowName": "TPM_V2_ProcessInterchange",
    "artifactVersion": null,
    "sender": null,
    "receiver": null,
    "senderAdapter": null,
    "receiverAdapter": null,
    "messageType": null,
    "applicationId": null
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": null,
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": null,
    "monitoringEnabled": true,
    "businessDomain": null,
    "businessProcess": null,
    "supportTeam": null,
    "supportContact": null,
    "criticality": null,
    "expectedProcessingType": null,
    "recoverySupported": false,
    "manualRecoverySupported": false,
    "maxRecoveryAttempts": null,
    "payloadPolicy": null,
    "alertPolicy": null,
    "businessIdentifiers": [],
    "headerAllowList": [],
    "propertyAllowList": []
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "MPL_COLLECTOR_RECONCILIATION",
    "confidence": "PROBABLE",
    "context": {
      "interchangeId": null,
      "senderPartner": null,
      "receiverPartner": null,
      "documentType": null,
      "processingStage": null,
      "processingDirection": null,
      "queueResolution": null
    }
  },

  "payloads": [],
  "headers": [],
  "properties": [],
  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],
  "events": [],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": null,
    "queueRole": null,
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": null,
    "lastOperationId": null
  },

  "audit": { "dataSources": ["MPL_API"] },

  "persistence": { "status": "PENDING" }
}
```

`confidence: "PROBABLE"` (not `HIGH`) is deliberate — the collector only inferred TPM_V2 from the standard package's own flow-name pattern, with no live Groovy confirmation. Same distinction the detection engine already makes between a name-shape match and a confirmed one.

### 7.5 TPM V2 — Hop 3: `TPM_MAPPED_EDI_HANDOFF` (healthy path)

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0003",
    "mplId": "MPL-TPM-HANDOFF-003",
    "correlationId": "TPM-CORR-20260812-01827",
    "businessTransactionId": "PO-0004521",
    "parentMessageId": "tpm-msg-0002",
    "hopSequence": 3,
    "hopName": "TPM_MAPPED_EDI_HANDOFF",
    "hopType": "INTERNAL_HANDOFF",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "COMPLETED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:00:03Z",
    "completedAt": "2026-08-12T09:00:04Z",
    "processingTimeMs": 640
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "TPM Interchange Processing",
    "flowName": "TPM_Mapped_EDI_Handoff",
    "artifactVersion": "1.0.0",
    "sender": "PARTNER_ACME_SUPPLY",
    "receiver": "S4HANA_PROCUREMENT",
    "senderAdapter": "TPM_V2_STANDARD",
    "receiverAdapter": "PROCESS_DIRECT",
    "messageType": "X12_850",
    "applicationId": "TPM_EDI_GATEWAY"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": "TPM_ProcessDirect_MappedHandoff",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "TPM-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "PROCUREMENT",
    "businessProcess": "PURCHASE_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": false,
      "captureIntermediatePayloads": true,
      "captureFinalRequestPayload": true,
      "captureResponsePayload": true,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["PurchaseOrderNumber", "InterchangeId"],
    "headerAllowList": ["TPM_InterchangeId", "TPM_QueueHint"],
    "propertyAllowList": ["PurchaseOrderNumber"]
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "interchangeId": "TPM-INT-0001827",
      "senderPartner": "PARTNER_ACME_SUPPLY",
      "receiverPartner": "S4HANA_PROCUREMENT",
      "documentType": "X12_850",
      "processingStage": "MAPPED_EDI_HANDOFF",
      "processingDirection": "OUTBOUND",
      "queueResolution": {
        "strategy": "PAYLOAD_HINT",
        "resolved": true,
        "queueName": "SAP_TPM_OUTBOUND_Q",
        "queueRole": "MAIN",
        "evidenceSource": "TPM_QueueHint property set by TPM v2 standard processing",
        "probedQueues": []
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-TPM-002",
      "type": "INTERCHANGE",
      "stage": "TPM_MAPPED_EDI",
      "direction": "OUTBOUND",
      "description": "Mapped EDI handed off from TPM v2 standard processing to the custom process-direct step",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 5310,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<ORDERS05><IDOC>...</IDOC></ORDERS05>",
      "capturedAt": "2026-08-12T09:00:04Z",
      "sourceStep": "TPM_ProcessDirect_MappedHandoff"
    }
  ],

  "headers": [
    { "name": "TPM_InterchangeId", "value": "TPM-INT-0001827", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "TPM_QueueHint", "value": "SAP_TPM_OUTBOUND_Q", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "PurchaseOrderNumber", "value": "PO-0004521", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-TPM-002", "timestamp": "2026-08-12T09:00:04Z", "type": "MAPPED_EDI_HANDOFF_COMPLETE", "source": "CPI" }
  ],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": "SAP_TPM_OUTBOUND_Q",
    "queueRole": "MAIN",
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": "MPL_CUSTOM_HEADER",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.6 TPM V2 — Hop 3 failure variant (same hop, alternate outcome)

Everything is identical to §7.5 except `message.status`, `framework.context.queueResolution`, `failureEvidence`, `failure`, and `recovery` — shown here as a complete document (not a diff) so it stands alone as a reference.

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0003b",
    "mplId": "MPL-TPM-HANDOFF-003B",
    "correlationId": "TPM-CORR-20260812-01899",
    "businessTransactionId": "PO-0004522",
    "parentMessageId": "tpm-msg-0002b",
    "hopSequence": 3,
    "hopName": "TPM_MAPPED_EDI_HANDOFF",
    "hopType": "INTERNAL_HANDOFF",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "FAILED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T11:00:03Z",
    "completedAt": "2026-08-12T11:00:04Z",
    "processingTimeMs": 610
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "TPM Interchange Processing",
    "flowName": "TPM_Mapped_EDI_Handoff",
    "artifactVersion": "1.0.0",
    "sender": "PARTNER_ACME_SUPPLY",
    "receiver": "S4HANA_PROCUREMENT",
    "senderAdapter": "TPM_V2_STANDARD",
    "receiverAdapter": "PROCESS_DIRECT",
    "messageType": "X12_850",
    "applicationId": "TPM_EDI_GATEWAY"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "ERROR",
    "customStatus": "TECHNICAL_ERROR",
    "lastErrorStep": "TPM_ProcessDirect_MappedHandoff",
    "lastSuccessfulStep": "TPM_V2_ProcessInterchange",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "TPM-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "PROCUREMENT",
    "businessProcess": "PURCHASE_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": false,
      "captureIntermediatePayloads": true,
      "captureFinalRequestPayload": true,
      "captureResponsePayload": true,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["PurchaseOrderNumber", "InterchangeId"],
    "headerAllowList": ["TPM_InterchangeId", "TPM_QueueHint"],
    "propertyAllowList": ["PurchaseOrderNumber"]
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "interchangeId": "TPM-INT-0001899",
      "senderPartner": "PARTNER_ACME_SUPPLY",
      "receiverPartner": "S4HANA_PROCUREMENT",
      "documentType": "X12_850",
      "processingStage": "MAPPED_EDI_HANDOFF",
      "processingDirection": "OUTBOUND",
      "queueResolution": {
        "strategy": "PAYLOAD_HINT",
        "resolved": true,
        "queueName": "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
        "queueRole": "DLQ",
        "evidenceSource": "TPM_QueueHint property set by TPM v2 standard processing",
        "probedQueues": []
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-TPM-002B",
      "type": "INTERCHANGE",
      "stage": "TPM_MAPPED_EDI",
      "direction": "OUTBOUND",
      "description": "Mapped EDI that failed to reach the receiver adapter",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 5480,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<ORDERS05><IDOC>...</IDOC></ORDERS05>",
      "capturedAt": "2026-08-12T11:00:04Z",
      "sourceStep": "TPM_ProcessDirect_MappedHandoff"
    }
  ],

  "headers": [
    { "name": "TPM_InterchangeId", "value": "TPM-INT-0001899", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "TPM_QueueHint", "value": "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "PurchaseOrderNumber", "value": "PO-0004522", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [
    { "evidenceId": "EVID-TPM-001", "type": "ADAPTER", "name": "ReceiverConnectionState", "value": "TIMEOUT", "source": "CPI_RUNTIME" }
  ],

  "failure": {
    "detected": true,
    "classification": "TECHNICAL",
    "severity": "HIGH",
    "actionable": true,
    "confidence": "HIGH",
    "reason": "TPM receiver adapter connection timeout while delivering mapped EDI to S4HANA_PROCUREMENT"
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-TPM-003", "timestamp": "2026-08-12T11:00:04Z", "type": "FAILED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "RECOVERABLE",
    "layer": "TPM_DLQ",
    "currentQueue": "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
    "queueRole": "DLQ",
    "sourceQueue": "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
    "targetQueue": "SAP_TPM_INBOUND_Q",
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": 0,
    "maxRetries": 5,
    "manualQueue": null,
    "recoveryMethod": "TPM_QUEUE_MOVE",
    "discoveryMethod": "MPL_CUSTOM_HEADER",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

Note: the processing DLQ maps to `SAP_TPM_INBOUND_Q` — not the receiver DLQ's mapping (`SAP_TPM_OUTBOUND_Q`), which is a *different* target and only applies when the failure happens on the receiver side. This is exactly the static, configuration-driven mapping described in §6.2 — never re-derived per transaction.

### 7.7 TPM V2 — Hop 4: `RECEIVER_RESPONSE`

Continuing the healthy chain from §7.3–7.5 (interchange `TPM-INT-0001827`).

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0004",
    "mplId": "MPL-TPM-RESPONSE-004",
    "correlationId": "TPM-CORR-20260812-01827",
    "businessTransactionId": "PO-0004521",
    "parentMessageId": "tpm-msg-0003",
    "hopSequence": 4,
    "hopName": "RECEIVER_RESPONSE",
    "hopType": "EXIT",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "COMPLETED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:00:05Z",
    "completedAt": "2026-08-12T09:00:06Z",
    "processingTimeMs": 540
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "TPM Interchange Processing",
    "flowName": "Custom_Receiver_iFlow",
    "artifactVersion": "1.0.0",
    "sender": "S4HANA_PROCUREMENT",
    "receiver": "PARTNER_ACME_SUPPLY",
    "senderAdapter": "PROCESS_DIRECT",
    "receiverAdapter": "IDOC",
    "messageType": "X12_850",
    "applicationId": "TPM_EDI_GATEWAY"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": "Custom_Receiver_iFlow",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "TPM-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "PROCUREMENT",
    "businessProcess": "PURCHASE_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": false,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": false,
      "captureResponsePayload": true,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["PurchaseOrderNumber", "InterchangeId"],
    "headerAllowList": ["TPM_InterchangeId"],
    "propertyAllowList": ["PurchaseOrderNumber"]
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "interchangeId": "TPM-INT-0001827",
      "senderPartner": "PARTNER_ACME_SUPPLY",
      "receiverPartner": "S4HANA_PROCUREMENT",
      "documentType": "X12_850",
      "processingStage": "RECEIVER_RESPONSE",
      "processingDirection": "OUTBOUND",
      "queueResolution": null
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-TPM-003",
      "type": "RESPONSE",
      "stage": "OUTBOUND_RESPONSE",
      "direction": "OUTBOUND",
      "description": "Response returned by the receiver system",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 640,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<IDOC_RESPONSE><STATUS>OK</STATUS></IDOC_RESPONSE>",
      "capturedAt": "2026-08-12T09:00:06Z",
      "sourceStep": "Custom_Receiver_iFlow"
    }
  ],

  "headers": [
    { "name": "TPM_InterchangeId", "value": "TPM-INT-0001827", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [
    { "name": "PurchaseOrderNumber", "value": "PO-0004521", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-TPM-004", "timestamp": "2026-08-12T09:00:06Z", "type": "RESPONSE_RECEIVED", "source": "CUSTOM_RECEIVER_IFLOW" }
  ],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": null,
    "queueRole": null,
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": null,
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.8 TPM V2 — Hop 5: `RECEIVER_EVENT`

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "tpm-msg-0005",
    "mplId": "MPL-TPM-EVENT-005",
    "correlationId": "TPM-CORR-20260812-01827",
    "businessTransactionId": "PO-0004521",
    "parentMessageId": "tpm-msg-0004",
    "hopSequence": 5,
    "hopName": "RECEIVER_EVENT",
    "hopType": "EXIT",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "COMPLETED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:00:06Z",
    "completedAt": "2026-08-12T09:00:06Z",
    "processingTimeMs": 90
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "TPM Interchange Processing",
    "flowName": "Custom_Receiver_iFlow",
    "artifactVersion": "1.0.0",
    "sender": "S4HANA_PROCUREMENT",
    "receiver": "PARTNER_ACME_SUPPLY",
    "senderAdapter": "PROCESS_DIRECT",
    "receiverAdapter": "IDOC",
    "messageType": "X12_850",
    "applicationId": "TPM_EDI_GATEWAY"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "INFO",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": "Custom_Receiver_iFlow",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "TPM-FRAMEWORK-001",
    "monitoringEnabled": true,
    "businessDomain": "PROCUREMENT",
    "businessProcess": "PURCHASE_ORDER",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": false,
    "manualRecoverySupported": false,
    "maxRecoveryAttempts": null,
    "payloadPolicy": {
      "captureStartingPayload": false,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": false,
      "captureResponsePayload": false,
      "captureErrorPayload": false,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": false, "alertOnFailure": false },
    "businessIdentifiers": ["PurchaseOrderNumber"],
    "headerAllowList": [],
    "propertyAllowList": ["PurchaseOrderNumber"]
  },

  "framework": {
    "type": "TPM_V2",
    "detectedBy": "CONFIGURATION",
    "confidence": "HIGH",
    "context": {
      "interchangeId": "TPM-INT-0001827",
      "senderPartner": "PARTNER_ACME_SUPPLY",
      "receiverPartner": "S4HANA_PROCUREMENT",
      "documentType": "X12_850",
      "processingStage": "RECEIVER_EVENT",
      "processingDirection": "OUTBOUND",
      "queueResolution": null
    }
  },

  "payloads": [],

  "headers": [],

  "properties": [
    { "name": "PurchaseOrderNumber", "value": "PO-0004521", "category": "BUSINESS", "source": "DEVELOPER" }
  ],

  "failureEvidence": [],

  "failure": {
    "detected": false,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": null
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-TPM-005", "timestamp": "2026-08-12T09:00:06Z", "type": "IDOC_STATUS_SYNCED", "source": "CUSTOM_RECEIVER_IFLOW" },
    { "eventId": "EVT-TPM-006", "timestamp": "2026-08-12T09:00:06Z", "type": "NO_EXCEPTION_RECORDED", "source": "CUSTOM_RECEIVER_IFLOW" }
  ],

  "recovery": {
    "status": "NOT_APPLICABLE",
    "layer": null,
    "currentQueue": null,
    "queueRole": null,
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": null,
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.9 Common IDoc Router — routing failure

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "router-msg-0001",
    "mplId": "MPL-ROUTER-001",
    "correlationId": "ROUTE-CORR-20260812-0091",
    "businessTransactionId": "1000456",
    "parentMessageId": null,
    "hopSequence": 1,
    "hopName": "COMMON_ROUTER_ROUTING",
    "hopType": "STANDALONE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "FAILED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:20:00Z",
    "completedAt": "2026-08-12T09:20:01Z",
    "processingTimeMs": 310
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "Common IDoc Router",
    "flowName": "Common_Router_Main",
    "artifactVersion": "1.1.0",
    "sender": "SHOPIFY",
    "receiver": "S4HANA",
    "senderAdapter": "IDOC",
    "receiverAdapter": "JMS",
    "messageType": "ORDERS05",
    "applicationId": "COMMON_ROUTER"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "ERROR",
    "customStatus": "ROUTING_ERROR",
    "lastErrorStep": "Common_Router_Route_Resolution",
    "lastSuccessfulStep": "Common_RFC_Entrance",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "COMMON-ROUTER-001",
    "monitoringEnabled": true,
    "businessDomain": "ORDER_MANAGEMENT",
    "businessProcess": "IDOC_ROUTING",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "HIGH",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": null,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": false,
      "captureResponsePayload": false,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["SNDPRN", "RCVPRN"],
    "headerAllowList": ["SNDPRN", "RCVPRN", "IDOCTYP", "MESTYP"],
    "propertyAllowList": []
  },

  "framework": {
    "type": "COMMON_IDOC_ROUTER",
    "detectedBy": "QUEUE_EVIDENCE",
    "confidence": "CONFIRMED",
    "context": {
      "sndprn": "SHOPIFY",
      "rcvprn": "S4HANA",
      "idoctyp": "ORDERS05",
      "mestyp": "ORDERS",
      "routingStatus": "FAILED",
      "routingError": "No matching SNDPRN/RCVPRN routing rule found in Partner Directory",
      "queueResolution": {
        "strategy": "DLQ_LAYER_PROBE",
        "resolved": true,
        "queueName": "Common_Router_JMS_DLQ",
        "queueRole": "DLQ",
        "probedQueues": [
          { "queueName": "Common_Router_JMS", "found": false },
          { "queueName": "Common_Router_JMS_DLQ", "found": true }
        ]
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-ROUTER-001",
      "type": "STARTING",
      "stage": "INBOUND",
      "direction": "INBOUND",
      "description": "IDoc as received before routing",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 3820,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<ORDERS05><IDOC><EDI_DC40>...</EDI_DC40></IDOC></ORDERS05>",
      "capturedAt": "2026-08-12T09:20:00Z",
      "sourceStep": "Common_RFC_Entrance"
    }
  ],

  "headers": [
    { "name": "SNDPRN", "value": "SHOPIFY", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "RCVPRN", "value": "S4HANA", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "IDOCTYP", "value": "ORDERS05", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "MESTYP", "value": "ORDERS", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [],

  "failureEvidence": [
    { "evidenceId": "EVID-ROUTER-001", "type": "ROUTING", "name": "PartnerDirectoryLookup", "value": "NO_MATCH", "source": "FRAMEWORK_RUNTIME" }
  ],

  "failure": {
    "detected": true,
    "classification": "ROUTING",
    "severity": "HIGH",
    "actionable": true,
    "confidence": "HIGH",
    "reason": "No matching SNDPRN/RCVPRN routing rule"
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-ROUTER-001", "timestamp": "2026-08-12T09:20:00Z", "type": "SYNC_ATTEMPT_FAILED", "source": "FRAMEWORK_RUNTIME" },
    { "eventId": "EVT-ROUTER-002", "timestamp": "2026-08-12T09:20:01Z", "type": "CONVERTED_TO_ASYNC", "source": "FRAMEWORK_RUNTIME" },
    { "eventId": "EVT-ROUTER-003", "timestamp": "2026-08-12T09:20:01Z", "type": "FAILED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "RECOVERABLE",
    "layer": "COMMON_ROUTER_DLQ",
    "currentQueue": "Common_Router_JMS_DLQ",
    "queueRole": "DLQ",
    "sourceQueue": "Common_Router_JMS_DLQ",
    "targetQueue": "Common_Router_JMS",
    "manualStepRequired": true,
    "retentionGuaranteeDays": 7,
    "retryCount": 0,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": "MOVE_TO_ROUTER_QUEUE",
    "discoveryMethod": "QUEUE_PROBE",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

`manualStepRequired: true` and `retentionGuaranteeDays: 7` are the two facts that make this recovery layer distinct from `JMS_QUEUE_DLQ`/`TPM_DLQ` (§8.5.3) — today a developer moves it by hand, and the guarantee is that no message escapes the integration layer for at least 7 days even so.

### 7.10 IDoc Status Sync — 997 rejection

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "status-msg-0001",
    "mplId": "MPL-STATUS-001",
    "correlationId": "STATUS-CORR-20260812-0044",
    "businessTransactionId": "900001234567",
    "parentMessageId": null,
    "hopSequence": 1,
    "hopName": "IDOC_STATUS_SYNC",
    "hopType": "STANDALONE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "FAILED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:25:00Z",
    "completedAt": "2026-08-12T09:25:01Z",
    "processingTimeMs": 210
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "IDoc Status Sync",
    "flowName": "Status_Sync_Main",
    "artifactVersion": "1.0.0",
    "sender": "S4HANA",
    "receiver": "SHOPIFY",
    "senderAdapter": "IDOC",
    "receiverAdapter": "JMS",
    "messageType": "997",
    "applicationId": "STATUS_SYNC"
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "ERROR",
    "customStatus": "ACK_REJECTED",
    "lastErrorStep": "Status_Sync_Ack_Processing",
    "lastSuccessfulStep": "Status_Sync_Ingress",
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": "STATUS-SYNC-001",
    "monitoringEnabled": true,
    "businessDomain": "ORDER_MANAGEMENT",
    "businessProcess": "IDOC_STATUS_ACKNOWLEDGEMENT",
    "supportTeam": "Integration Development",
    "supportContact": "integration-support@example.com",
    "criticality": "MEDIUM",
    "expectedProcessingType": "ASYNCHRONOUS",
    "recoverySupported": true,
    "manualRecoverySupported": true,
    "maxRecoveryAttempts": 5,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": false,
      "captureResponsePayload": false,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": ["IdocNumber"],
    "headerAllowList": ["IdocNumber", "AcknowledgementType"],
    "propertyAllowList": []
  },

  "framework": {
    "type": "IDOC_STATUS_SYNC",
    "detectedBy": "QUEUE_EVIDENCE",
    "confidence": "CONFIRMED",
    "context": {
      "idocNumber": "900001234567",
      "previousStatus": "03",
      "currentStatus": "51",
      "targetStatus": "06",
      "acknowledgementType": "997",
      "queueResolution": {
        "strategy": "DLQ_LAYER_PROBE",
        "resolved": true,
        "queueName": "Status_JMS_DLQ",
        "queueRole": "DLQ",
        "probedQueues": [
          { "queueName": "Status_JMS", "found": false },
          { "queueName": "Status_JMS_DLQ", "found": true }
        ]
      }
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-STATUS-001",
      "type": "STARTING",
      "stage": "INBOUND",
      "direction": "INBOUND",
      "description": "997 functional acknowledgment as received",
      "mimeType": "application/xml",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 980,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "<X12_997><AK1>...</AK1><AK9>R</AK9></X12_997>",
      "capturedAt": "2026-08-12T09:25:00Z",
      "sourceStep": "Status_Sync_Ingress"
    }
  ],

  "headers": [
    { "name": "IdocNumber", "value": "900001234567", "category": "FRAMEWORK", "source": "CPI_RUNTIME" },
    { "name": "AcknowledgementType", "value": "997", "category": "FRAMEWORK", "source": "CPI_RUNTIME" }
  ],

  "properties": [],

  "failureEvidence": [
    { "evidenceId": "EVID-STATUS-001", "type": "ACK_STATUS", "name": "997_FunctionalAcknowledgment", "value": "REJECTED", "source": "MPL_API" }
  ],

  "failure": {
    "detected": true,
    "classification": "BUSINESS",
    "severity": "MEDIUM",
    "actionable": true,
    "confidence": "HIGH",
    "reason": "997 acknowledgment indicates the IDoc was rejected by the receiver; status could not sync to target 06"
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-STATUS-001", "timestamp": "2026-08-12T09:25:01Z", "type": "FAILED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "RECOVERABLE",
    "layer": "STATUS_SYNC_DLQ",
    "currentQueue": "Status_JMS_DLQ",
    "queueRole": "DLQ",
    "sourceQueue": "Status_JMS_DLQ",
    "targetQueue": "Status_JMS",
    "manualStepRequired": false,
    "retentionGuaranteeDays": null,
    "retryCount": 1,
    "maxRetries": 5,
    "manualQueue": null,
    "recoveryMethod": "STATUS_QUEUE_MOVE",
    "discoveryMethod": "QUEUE_PROBE",
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY"] },

  "persistence": { "status": "PENDING" }
}
```

### 7.11 Unknown / No framework matched

Not framework-populated at all — shown so it is clear what "nothing matched" honestly looks like, rather than a `framework` object with fabricated content.

```json
{
  "schemaVersion": "1.1",
  "recordType": "MONITORING_TRANSACTION",

  "message": {
    "messageId": "unknown-msg-0001",
    "mplId": "MPL-UNKNOWN-001",
    "correlationId": "UNK-CORR-20260812-0007",
    "businessTransactionId": null,
    "parentMessageId": null,
    "hopSequence": null,
    "hopName": null,
    "hopType": "STANDALONE",
    "capturedBy": "GROOVY_RUNTIME",
    "status": "FAILED",
    "statusSource": "GROOVY_ASSERTED",
    "statusVerified": false,
    "statusDiscrepancy": null,
    "createdAt": "2026-08-12T09:30:00Z",
    "completedAt": "2026-08-12T09:30:01Z",
    "processingTimeMs": 190
  },

  "environment": {
    "name": "DEV",
    "tenantName": "DEV Tenant",
    "tenantUrl": "https://tenant.example.hana.ondemand.com",
    "region": "US10"
  },

  "integration": {
    "packageName": "Unclassified",
    "flowName": "Totally_Unrelated_Flow",
    "artifactVersion": null,
    "sender": "UNKNOWN_SENDER",
    "receiver": "UNKNOWN_RECEIVER",
    "senderAdapter": null,
    "receiverAdapter": null,
    "messageType": null,
    "applicationId": null
  },

  "monitoring": {
    "source": "SAP_CPI",
    "sourceType": "MPL",
    "logLevel": "ERROR",
    "customStatus": null,
    "lastErrorStep": null,
    "lastSuccessfulStep": null,
    "processingStarted": true,
    "processingCompleted": true
  },

  "sop": {
    "configurationId": null,
    "monitoringEnabled": true,
    "businessDomain": null,
    "businessProcess": null,
    "supportTeam": null,
    "supportContact": null,
    "criticality": null,
    "expectedProcessingType": null,
    "recoverySupported": false,
    "manualRecoverySupported": false,
    "maxRecoveryAttempts": null,
    "payloadPolicy": {
      "captureStartingPayload": true,
      "captureIntermediatePayloads": false,
      "captureFinalRequestPayload": false,
      "captureResponsePayload": false,
      "captureErrorPayload": true,
      "maxPayloadSizeBytes": 10485760,
      "truncateOversizedPayload": true,
      "upstreamAlreadyCaptured": false,
      "upstreamCaptureConfirmationHeader": null
    },
    "alertPolicy": { "enabled": true, "alertOnFailure": true },
    "businessIdentifiers": [],
    "headerAllowList": [],
    "propertyAllowList": []
  },

  "framework": {
    "type": "UNKNOWN",
    "detectedBy": null,
    "confidence": "NONE",
    "context": {
      "reason": "No configured detection rule matched this message's flow name, correlation group, or queue location",
      "evidenceChecked": ["integrationFlowPatterns", "correlationFlowNames", "queueTopology"],
      "suggestedFramework": null,
      "manualFramework": null,
      "assignedBy": null,
      "assignedAt": null
    }
  },

  "payloads": [
    {
      "payloadId": "PAY-UNKNOWN-001",
      "type": "STARTING",
      "stage": "INBOUND",
      "direction": "INBOUND",
      "description": "Captured on generic failure policy — framework-blind capture",
      "mimeType": "application/octet-stream",
      "encoding": "UTF-8",
      "compression": "none",
      "sizeBytes": 512,
      "isTruncated": false,
      "representation": "TEXT",
      "content": "(unrecognized payload shape)",
      "capturedAt": "2026-08-12T09:30:00Z",
      "sourceStep": "Totally_Unrelated_Flow"
    }
  ],

  "headers": [],

  "properties": [],

  "failureEvidence": [],

  "failure": {
    "detected": true,
    "classification": null,
    "severity": null,
    "actionable": false,
    "confidence": null,
    "reason": "Framework undetermined — see framework.context.reason"
  },

  "attachments": [],

  "events": [
    { "eventId": "EVT-UNKNOWN-001", "timestamp": "2026-08-12T09:30:01Z", "type": "FAILED", "source": "MPL_API" }
  ],

  "recovery": {
    "status": "MANUAL_INVESTIGATION_REQUIRED",
    "layer": null,
    "currentQueue": null,
    "queueRole": null,
    "sourceQueue": null,
    "targetQueue": null,
    "manualStepRequired": true,
    "retentionGuaranteeDays": null,
    "retryCount": null,
    "maxRetries": null,
    "manualQueue": null,
    "recoveryMethod": null,
    "discoveryMethod": null,
    "lastOperationId": null
  },

  "audit": { "dataSources": ["CPI_GROOVY", "MPL_API"] },

  "persistence": { "status": "PENDING" }
}
```

If a developer later manually assigns a framework through the portal, only `framework.context.manualFramework`/`assignedBy`/`assignedAt` change — `framework.type` itself stays `UNKNOWN` until a real detection pass confirms it, since a manual assignment is an operator's guess, not evidence.

---

## 8. CPI Integration Architecture

### 8.1 What the Monitoring Groovy must and must not do

**Must:**
- Extract → normalize → emit the standard JSON envelope (§4) → write to Global Data Store
- Populate only fields it actually has evidence for; use `null`/omit optional fields rather than fabricate
- Generate `messageId` (and every child-record id — `payloadId`, `attachmentId`, `eventId`, `evidenceId`) itself, so persistence retries are idempotent (§10.2)
- Set `message.hopSequence`/`hopName`/`hopType` for any framework with more than one hop
- Assert `message.status` itself (`statusSource: "GROOVY_ASSERTED"`), from the developer-maintained `STATE` constant — this is the **primary** write in v1.2, not a placeholder (§8.1a)
- Assemble `events[]` from every `EVENT-NNN`-prefixed header/property present on the message at the point the final Groovy step runs (§8.1a)

**Must not:**
- Query HANA or perform JDBC — it never talks to the database directly
- Know the HANA schema, SQL, or table names
- Fabricate a value to satisfy the schema
- Implement recovery logic or hardcode DLQ→target queue mappings (that is configuration, read by the backend/recovery layer, not baked into every Groovy script)
- Trust its own `STATUS` assertion as infallible — a message it marks `SUCCESS` can still fail downstream of the last Groovy step it ran in; that gap is exactly what the Reconciliation Job (§8.4) exists to catch, not something Groovy should try to solve itself

### 8.1a The `EVENT-NNN` mechanism — how `events[]` gets built across a stateless flow

A CPI Script step is a **fresh execution context every time it runs** — a variable set in one Groovy step does not survive into the next one, let alone across a Normal Process / Local Integration Process / Exception Subprocess boundary. The one thing that *does* survive across those boundaries is the message's own headers and exchange properties. That is the entire reason this mechanism is header/property-based rather than an in-memory array Groovy appends to:

```text
Normal Process
   │
   ├─ Mapping step completes
   │     └─ Groovy sets header/property: EVENT-001 = "Mapping Success: 12 fields mapped"
   │
   ├─ Groovy validation step completes
   │     └─ Groovy sets: EVENT-002 = "Groovy Validation Successful: schema v2.1"
   │
   ├─ Local Integration Process (isolated exception scope)
   │     │
   │     ├─ succeeds ─────────────────────────┐
   │     │                                     │
   │     └─ fails, but is swallowed here        │   ("half-cooked": the LIP's own
   │           (outer flow continues) ──────────┤    outcome doesn't yet decide the
   │                                             │    whole message's final STATE)
   │                                             ▼
   ├─ Receiver call completes
   │     └─ Groovy sets: EVENT-003 = "Receiver Success: HTTP 200"
   │
   └─ FINAL Groovy step (whichever branch actually executes —
       success end OR the exception subprocess):
         1. Reads every header/property matching EVENT-\d+
         2. Sorts numerically (EVENT-001, EVENT-002, EVENT-003, …)
         3. Assembles events[] in that order
         4. Sets EVENT-004 = "Final Update Success" (or the exception
            subprocess's own equivalent) — the flow's own last word on
            what happened, always included whichever branch ran
         5. Reads the developer-maintained STATE constant and asserts
            message.status from it (statusSource: GROOVY_ASSERTED)
```

Two things make this reliable rather than fragile:
- **Numeric prefixes, not fixed names.** Developers add `EVENT-005`, `EVENT-006`, … at whatever new steps they introduce, without touching the final collector step's logic — it always just "read everything matching `EVENT-\d+`, sort, done."
- **The final step runs in every branch.** Both the success end and the exception subprocess implement the same final collection logic (or call a shared library step) — whichever one the flow actually reaches is the one that asserts `STATE` and assembles `events[]`, so a message is never left without a terminal answer *except* in the true infrastructure-failure case (§2's gap #2), which is what the Reconciliation Job's backfill half covers.

### 8.2 Global Data Store

The buffer between Groovy and persistence. Its retention **must** exceed the worst-case persistence outage, not just the happy-path batch interval:

```text
Normal persistence cycle:     < 5 minutes
Expected outage tolerance:    hours
Data Store retention:         several days (SLA, not a default)
```

If the Central Persistence iFlow is down for hours, records must still be recoverable from the Data Store once it comes back — this is the persistence pipeline's own resilience, entirely separate from business-message recovery (§8.6).

### 8.3 Central Persistence iFlow — the Persistence Framework

Treated as its own framework, with the same rigor as a business-recovery framework:

```text
Global Data Store
       │
       ▼
  Batch Collector  (select N pending transactions)
       │
       ▼
    Validate       (schema + mandatory-field checks, §11 —
       │             a validation failure is recorded, not silently dropped)
       ▼
   Deduplicate      (by MESSAGE_ID; a replayed batch must not double-insert)
       │
       ▼
  Transform to      (map envelope → normalized MON_* rows,
   DB model           respecting the ownership matrix, §3.2)
       │
       ▼
   Batch JDBC        (MERGE for current-state tables,
       │               INSERT for history tables — §10.1)
       ▼
     HANA
```

### 8.4 Reconciliation & Forensic Backfill Job (formerly "MPL Collector")

**Renamed and narrowed in v1.2.** This is no longer the primary writer of `STATUS` — Groovy is (§2, §8.1a). It runs on a schedule, separate from the real-time Groovy path, and now does exactly two jobs, neither of which touches `STATUS` itself:

**Job A — Safety-net verification (flag only, never auto-correct):**

```text
For each MON_MESSAGE row with STATUS_VERIFIED = false and an age
past the expected MPL-availability window:
    │
    ▼
  Fetch the real MPL status for this MPL_ID
    │
    ├─ matches Groovy's STATUS ──► STATUS_VERIFIED = true, STATUS_DISCREPANCY = NULL
    │
    └─ disagrees ──► STATUS_VERIFIED = true,
                      STATUS_DISCREPANCY = "MPL reports <X>; Groovy asserted <Y>"
                      STATUS itself is NEVER written here (§3.2) — the UI
                      shows a warning badge on the row; an operator decides
                      what the disagreement means, since STATE and MPL status
                      can legitimately be answering different questions
                      (business outcome vs. technical outcome)
```

**Job B — Forensic backfill (MPL-exclusive data Groovy has no way to capture):**

```text
MPL OData API
    │
    ├── ErrorInformation
    ├── AdapterAttributes
    ├── Attachments
    ├── Runs
    └── MessageStoreEntries
             │
             ▼
   INSERT into MON_RUN / MON_ERROR / MON_ADAPTER_ATTRIBUTE /
               MON_ATTACHMENT / MON_MESSAGE_STORE_ENTRY
   (Also fills LOG_START/LOG_END/SENDER/RECEIVER/etc. — but ONLY when
    Groovy's own row is missing them, e.g. the TPM black-box hop below;
    never overwrites a value Groovy already captured.)
```

When this job encounters a real MPL entry with no corresponding Groovy record at all — the TPM black-box hop (§7.4), or a message where an infrastructure-level failure meant no Groovy step ever ran (§2's gap #2) — it creates the `MON_MESSAGE` row itself with `CAPTURED_BY = 'MPL_COLLECTOR_ONLY'`, `STATUS_SOURCE = 'MPL_COLLECTOR_ONLY'`, `STATUS` taken directly from the real MPL status (there is no Groovy assertion to defer to), and every framework/portal-owned column left `NULL` — never guessed.

### 8.5 Framework-specific CPI wiring

#### 8.5.1 JMS Framework

Five real topology variants, all producing the *same* JSON envelope shape — only `sop.payloadPolicy.upstreamAlreadyCaptured` and the presence/absence of custom-exit events differ (compare §7.1 and §7.2 directly).

**a. Common Router + JMS + Custom Exit**

```text
SAP IDoc
   │
   ▼
Common RFC iFlow
   (stores entrance payload in Data Store,
    sets confirmation header so JMS framework
    does not capture it again)
   │
   ▼
Main Common Router iFlow
   ├── Direct Receiver (Process Direct)
   ├── JMS Framework
   └── Multicast (multiple receivers)
        │
        ▼ (JMS Framework path)
JMS Ingress
   reads upstream-already-captured header ──► skips its own capture
   │
   ▼
Custom Exit Check ──► Yes (config from Partner Directory)
   │  records an event: "Custom exit applied"
   ▼
   Which type?
     ├── Process Direct → Custom Developer iFlow
     └── XSL mapping via Partner Directory binary parameter
   │
   ▼
Mapped payload logged in Data Store
   │
   ▼
Send to JMS queue
   │
   ▼  (egress side — independent custom-exit decision)
JMS Egress
   │
   ▼
Custom Exit Check ──► Yes (config from Partner Directory)
   │  records an event
   ▼
   Same two mapping-type options
   │
   ▼
Final payload sent to receiver
```

The confirmation header (`sop.payloadPolicy.upstreamAlreadyCaptured = true` / `upstreamCaptureConfirmationHeader`, §7.1) is the mechanism that prevents the same payload being persisted twice — once by the Common RFC iFlow, once redundantly by JMS. This is the CPI-side equivalent of the idempotency contract in §10.2, applied at capture time rather than only at persistence time.

**b. Common Router + JMS + No Custom Exit** — identical topology, minus the two Custom Exit Check branches; no exit-related events, no extra mapping hop (§7.2).

**c. Common Router + Custom iFlow + JMS + No Custom Exit** — an entrance/pre-entrance iFlow between the router and JMS may do its own mapping or validation before JMS ever sees the message. The framework cannot know whether that mapping happened. This is the one case where a **developer-filled SOP header is mandatory**: `sop.payloadPolicy.upstreamAlreadyCaptured` must be set explicitly by the developer's custom iFlow, since the framework has no way to infer it.

**d. Custom iFlow + JMS + No Custom Exit** — Common Router is not in the picture at all; an entrance iFlow (structurally similar to TPM's) fills the required SOP/framework fields before handing off to JMS. Same developer-responsibility caveat as (c) applies to mapping-before-JMS.

**e. Sync-to-Async via JMS** — a message starts synchronous, then converts to async and is handed to JMS with an extra parameter (`X-Target-ProcessDirect-URI`) so the framework knows this is a sync-to-async scenario rather than a plain async one. This changes `integration.senderAdapter`/response-handling semantics but not the envelope shape.

#### 8.5.2 TPM V2 — see the full worked chain in §7.3–7.8

The structurally important point for the DB/CPI teams: **SAP's own TPM v2 standard package cannot be instrumented.** The moment a message enters it, no Groovy runs until it exits into the custom receiver iFlow. This is why TPM is the one framework that *requires* the MPL-collector-only gap-fill hop (§8.4, worked in full in §7.4) — it is the only way to have any record at all of what happened inside the black box, and even then only once MPL data becomes available (never in real time).

#### 8.5.3 Common IDoc Router — the DLQ recovery loop

```text
IDoc
  │
  ▼
Sync attempt
  │
  ├─ succeeds ──► done
  │
  └─ fails
        │
        ▼
     Convert to async
        │
        ▼
     Send to Common_Router_JMS_DLQ
        │
        ▼ (today: manual)
     Developer moves DLQ → Common_Router_JMS
        │
        ▼
     Separate iFlow watching Common_Router_JMS
     re-sends to the main iFlow via Process Direct
```

This manual move is exactly what `recovery.manualStepRequired = true` and `recovery.retentionGuaranteeDays = 7` encode (§4.14, §5.3, worked in full in §7.9): the guarantee is that **no message escapes the integration layer for at least 7 days**, even though the move itself is not yet automated by the portal. When the portal automates this (planned), the JSON shape does not change — only `manualStepRequired` flips to `false` once the Recovery API can perform the move itself.

### 8.6 Persistence failure handling — a second, distinct kind of recovery

There are two unrelated recovery concepts in this architecture and they must never be conflated:

| | Business recovery | Persistence recovery |
|---|---|---|
| **Recovers** | A failed business transaction | A monitoring record that failed to reach HANA |
| **Triggered by** | An operator, via Recovery Center | The Persistence Framework itself, automatically |
| **Tables** | `MON_RECOVERY_CONTEXT` / `MON_RECOVERY_OPERATION` | `MON_PERSISTENCE_OPERATION` |
| **Failure destination** | A framework's own DLQ (JMS/TPM/Router/StatusSync) | A separate, dedicated Persistence DLQ |

```text
Data Store ──► Central Persistence ──► HANA
                      │  X unavailable
                      ▼
              Persistence Retry
                 ├── retry 1
                 ├── retry 2
                 ├── retry 3
                 └── Persistence DLQ
```

A monitoring system that silently loses its own records on a DB outage is not acceptable — the persistence pipeline gets the same retry/DLQ discipline as any business framework, tracked in `MON_PERSISTENCE_OPERATION` (§9.4) so it is independently observable ("Persistence Health: HANA Writer ● Healthy, Pending 32, Failed 0").

### 8.7 Backend read architecture

The UI5 frontend never becomes a HANA client. It talks only to the existing Monitoring Backend, which gains one more provider alongside the existing `IJmsProvider`/`IMonitoringProvider` pattern:

```text
UI5
 │
 ▼
GET /messages/{id}
 │
 ▼
Monitoring Backend
 │
 ├── IMonitoringProvider   (MPL — live, ≤15 days)
 ├── IHanaProvider         (persisted — up to retention limit)
 ├── IJmsProvider          (live queue state)
 └── (framework strategies, unchanged from the existing recovery layer)
 │
 ▼
Unified message view (backend merges MPL + HANA; the frontend
never needs to know which source answered)
```

Real/Mock split applies identically: `RealHanaProvider` / `MockHanaProvider`, matching every other provider in the SDK today. Inside the 15-day MPL window, the backend prefers live MPL + live queue state (as it does today); beyond that window, HANA is the only source and the backend degrades to it transparently.

---

## 9. Database Schema — SQL DDL

Target: **SAP HANA Cloud**. All tables use column store (the HANA Cloud default; `CREATE COLUMN TABLE` used explicitly below for clarity — on-prem installs would also need it). Every child-table primary key is **application-generated** (by Groovy or the Persistence Framework), never a HANA identity column — this is what makes replay/retry idempotent (§10.2). Every column in this DDL traces back to a specific field in §4's envelope tables — nothing here exists without a JSON path that produces it, and every mandatory/optional field in §4 has a home here.

> ⚠️ Partition and index definitions below are a starting point, not a final capacity plan. Validate against actual message volume, average/95th-percentile/max payload size, and your HANA Cloud service plan before committing to a partition scheme (see §12).

### 9.1 Core tables

```sql
-- =====================================================================
-- MON_MESSAGE — one row per hop (per MPL entry). The canonical spine
-- every other table hangs off of. Column groups below mirror §4's
-- envelope blocks 1:1 (message / environment / integration / monitoring
-- / framework / failure / sop / persistence) for easy cross-reference.
-- =====================================================================
CREATE COLUMN TABLE MON_MESSAGE (
  -- §4.1 message
  MESSAGE_ID                              NVARCHAR(36)   NOT NULL,
  MPL_ID                                  NVARCHAR(64),
  CORRELATION_ID                          NVARCHAR(128),
  BUSINESS_TRANSACTION_ID                 NVARCHAR(128),
  PARENT_MESSAGE_ID                       NVARCHAR(36),
  HOP_SEQUENCE                            INTEGER,
  HOP_NAME                                NVARCHAR(128),
  HOP_TYPE                                NVARCHAR(20),
  CAPTURED_BY                             NVARCHAR(20)   NOT NULL DEFAULT 'GROOVY_RUNTIME',
  STATUS                                  NVARCHAR(20)   NOT NULL,
  STATUS_SOURCE                           NVARCHAR(20)   NOT NULL DEFAULT 'GROOVY_ASSERTED',
  STATUS_VERIFIED                         BOOLEAN        NOT NULL DEFAULT FALSE,
  STATUS_DISCREPANCY                      NVARCHAR(512),
  LOG_START                               TIMESTAMP      NOT NULL,
  LOG_END                                 TIMESTAMP,
  PROCESSING_TIME_MS                      BIGINT,

  -- §4.2 environment
  ENVIRONMENT                             NVARCHAR(20)   NOT NULL,
  REGION                                  NVARCHAR(20),
  TENANT_NAME                             NVARCHAR(64)   NOT NULL,
  TENANT_URL                              NVARCHAR(256),

  -- §4.3 integration
  SENDER                                  NVARCHAR(128),
  RECEIVER                                NVARCHAR(128),
  SENDER_ADAPTER                          NVARCHAR(32),
  RECEIVER_ADAPTER                        NVARCHAR(32),
  INTEGRATION_FLOW_NAME                   NVARCHAR(256)  NOT NULL,
  INTEGRATION_PACKAGE_ID                  NVARCHAR(128),
  INTEGRATION_PACKAGE_NAME                NVARCHAR(256),
  ARTIFACT_VERSION                        NVARCHAR(32),
  MESSAGE_TYPE                            NVARCHAR(64),
  APPLICATION_ID                          NVARCHAR(64),
  TRANSACTION_ID                          NVARCHAR(128),
  PREVIOUS_COMPONENT_NAME                 NVARCHAR(128),
  LOCAL_COMPONENT_NAME                    NVARCHAR(128),
  ORIGIN_COMPONENT_NAME                   NVARCHAR(128),

  -- §4.4 monitoring
  LOG_LEVEL                               NVARCHAR(10),
  CUSTOM_STATUS                           NVARCHAR(64),
  LAST_ERROR_STEP                         NVARCHAR(128),
  LAST_SUCCESSFUL_STEP                    NVARCHAR(128),
  PROCESSING_STARTED                      BOOLEAN,
  PROCESSING_COMPLETED                    BOOLEAN,

  -- §4.5 sop
  SOP_CONFIGURATION_ID                    NVARCHAR(64),
  BUSINESS_DOMAIN                         NVARCHAR(64),
  BUSINESS_PROCESS                        NVARCHAR(64),
  SUPPORT_TEAM                            NVARCHAR(128),
  SUPPORT_CONTACT                         NVARCHAR(256),
  CRITICALITY                             NVARCHAR(10),
  EXPECTED_PROCESSING_TYPE                NVARCHAR(15),
  UPSTREAM_ALREADY_CAPTURED               BOOLEAN        NOT NULL DEFAULT FALSE,
  UPSTREAM_CAPTURE_CONFIRMATION_HEADER    NVARCHAR(128),

  -- §4.6 framework (envelope level; §5's context lives in §9.2's tables)
  FRAMEWORK_TYPE                          NVARCHAR(32)   NOT NULL DEFAULT 'UNKNOWN',
  FRAMEWORK_DETECTED_BY                   NVARCHAR(32),
  FRAMEWORK_CONFIDENCE                    NVARCHAR(10),

  -- §4.11 failure (Groovy/framework's own live classification —
  -- distinct from MPL's own MON_ERROR entity, §9.1 below)
  FAILURE_DETECTED                        BOOLEAN        NOT NULL DEFAULT FALSE,
  FAILURE_CLASSIFICATION                  NVARCHAR(20),
  FAILURE_SEVERITY                        NVARCHAR(10),
  FAILURE_ACTIONABLE                      BOOLEAN,
  FAILURE_CONFIDENCE                      NVARCHAR(10),
  FAILURE_REASON                          NVARCHAR(1024),

  -- §4.16 persistence (System-owned — see §8.6)
  PERSISTENCE_STATUS                      NVARCHAR(10)   NOT NULL DEFAULT 'PENDING',
  PERSISTED_AT                            TIMESTAMP,

  CREATED_AT                              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_MESSAGE PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT UQ_MON_MESSAGE_MPL_ID UNIQUE (MPL_ID),
  CONSTRAINT CHK_MON_MESSAGE_STATUS_SOURCE CHECK (STATUS_SOURCE IN ('GROOVY_ASSERTED', 'MPL_COLLECTOR_ONLY')),
  CONSTRAINT CHK_MON_MESSAGE_CAPTURED_BY CHECK (CAPTURED_BY IN ('GROOVY_RUNTIME', 'MPL_COLLECTOR_ONLY')),
  CONSTRAINT CHK_MON_MESSAGE_HOP_TYPE CHECK (HOP_TYPE IS NULL OR HOP_TYPE IN
    ('ENTRANCE', 'INTERNAL_HANDOFF', 'EXIT', 'STANDALONE')),
  CONSTRAINT CHK_MON_MESSAGE_FRAMEWORK CHECK (FRAMEWORK_TYPE IN
    ('TPM_V2', 'JMS_FRAMEWORK', 'COMMON_IDOC_ROUTER', 'IDOC_STATUS_SYNC', 'NON_FRAMEWORK', 'UNKNOWN')),
  CONSTRAINT CHK_MON_MESSAGE_FW_DETECTED_BY CHECK (FRAMEWORK_DETECTED_BY IS NULL OR FRAMEWORK_DETECTED_BY IN
    ('CONFIGURATION', 'QUEUE_EVIDENCE', 'MPL_COLLECTOR_RECONCILIATION', 'MANUAL')),
  CONSTRAINT CHK_MON_MESSAGE_CONFIDENCE CHECK (FRAMEWORK_CONFIDENCE IS NULL OR FRAMEWORK_CONFIDENCE IN
    ('HIGH', 'PROBABLE', 'NONE', 'CONFIRMED')),
  CONSTRAINT CHK_MON_MESSAGE_FAILURE_CLASS CHECK (FAILURE_CLASSIFICATION IS NULL OR FAILURE_CLASSIFICATION IN
    ('TECHNICAL', 'BUSINESS', 'ROUTING')),
  CONSTRAINT CHK_MON_MESSAGE_FAILURE_SEVERITY CHECK (FAILURE_SEVERITY IS NULL OR FAILURE_SEVERITY IN
    ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT CHK_MON_MESSAGE_FAILURE_CONFIDENCE CHECK (FAILURE_CONFIDENCE IS NULL OR FAILURE_CONFIDENCE IN
    ('HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT CHK_MON_MESSAGE_CRITICALITY CHECK (CRITICALITY IS NULL OR CRITICALITY IN
    ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT CHK_MON_MESSAGE_PROCESSING_TYPE CHECK (EXPECTED_PROCESSING_TYPE IS NULL OR EXPECTED_PROCESSING_TYPE IN
    ('SYNCHRONOUS', 'ASYNCHRONOUS')),
  CONSTRAINT CHK_MON_MESSAGE_PERSIST_STATUS CHECK (PERSISTENCE_STATUS IN
    ('PENDING', 'PROCESSING', 'PERSISTED', 'RETRYING', 'FAILED', 'DLQ'))
)
PARTITION BY RANGE (CREATED_AT) (
  PARTITION '2026-01-01' <= VALUES < '2026-02-01',
  PARTITION '2026-02-01' <= VALUES < '2026-03-01',
  PARTITION '2026-03-01' <= VALUES < '2026-04-01',
  PARTITION OTHERS
);

CREATE INDEX IX_MON_MESSAGE_CORRELATION ON MON_MESSAGE (CORRELATION_ID);
CREATE INDEX IX_MON_MESSAGE_STATUS ON MON_MESSAGE (STATUS);
CREATE INDEX IX_MON_MESSAGE_FRAMEWORK ON MON_MESSAGE (FRAMEWORK_TYPE);
CREATE INDEX IX_MON_MESSAGE_FLOW ON MON_MESSAGE (INTEGRATION_FLOW_NAME);
CREATE INDEX IX_MON_MESSAGE_SENDER ON MON_MESSAGE (SENDER);
CREATE INDEX IX_MON_MESSAGE_RECEIVER ON MON_MESSAGE (RECEIVER);
CREATE INDEX IX_MON_MESSAGE_ENV_STATUS_TIME ON MON_MESSAGE (ENVIRONMENT, STATUS, CREATED_AT);
CREATE INDEX IX_MON_MESSAGE_FRAMEWORK_STATUS_TIME ON MON_MESSAGE (FRAMEWORK_TYPE, STATUS, CREATED_AT);
CREATE INDEX IX_MON_MESSAGE_FAILURE ON MON_MESSAGE (FAILURE_DETECTED, FAILURE_CLASSIFICATION);
CREATE INDEX IX_MON_MESSAGE_SUPPORT_TEAM ON MON_MESSAGE (SUPPORT_TEAM);
-- Drives the Reconciliation Job's own query: "find rows not yet verified,
-- past the expected MPL-availability window" (§8.4, Job A).
CREATE INDEX IX_MON_MESSAGE_STATUS_VERIFIED ON MON_MESSAGE (STATUS_VERIFIED, CREATED_AT);


-- =====================================================================
-- MON_MESSAGE_DATA_SOURCE — §4.15 audit.dataSources[]. Every writer
-- appends its own row; nobody deletes another writer's row.
-- =====================================================================
CREATE COLUMN TABLE MON_MESSAGE_DATA_SOURCE (
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  SOURCE_SYSTEM         NVARCHAR(32)   NOT NULL,
  RECORDED_AT              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_MESSAGE_DATA_SOURCE PRIMARY KEY (MESSAGE_ID, SOURCE_SYSTEM),
  CONSTRAINT FK_MON_MESSAGE_DATA_SOURCE_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_MESSAGE_DATA_SOURCE_SYSTEM CHECK (SOURCE_SYSTEM IN
    ('CPI_GROOVY', 'MPL_API', 'FRAMEWORK', 'RECOVERY_ENGINE'))
);


-- =====================================================================
-- MON_PAYLOAD — one row per captured payload snapshot. INSERT-only.
-- =====================================================================
CREATE COLUMN TABLE MON_PAYLOAD (
  PAYLOAD_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_ID           NVARCHAR(36)   NOT NULL,

  PAYLOAD_TYPE          NVARCHAR(20)   NOT NULL,
  STAGE_NAME             NVARCHAR(64),
  DIRECTION               NVARCHAR(10),
  DESCRIPTION               NVARCHAR(512),

  MIME_TYPE                  NVARCHAR(64),
  ENCODING                    NVARCHAR(16),
  COMPRESSION                  NVARCHAR(16),

  SIZE_BYTES                     BIGINT,
  ORIGINAL_SIZE_BYTES              BIGINT,
  STORED_SIZE_BYTES                  BIGINT,
  IS_TRUNCATED                        BOOLEAN        NOT NULL DEFAULT FALSE,

  REPRESENTATION                       NVARCHAR(10)   NOT NULL DEFAULT 'TEXT',
  PAYLOAD_TEXT                          NCLOB,
  PAYLOAD_BINARY                         BLOB,

  SOURCE_STEP                             NVARCHAR(128),
  TARGET_RECEIVER                          NVARCHAR(128),

  CAPTURED_AT                               TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_PAYLOAD PRIMARY KEY (PAYLOAD_ID),
  CONSTRAINT FK_MON_PAYLOAD_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_PAYLOAD_TYPE CHECK (PAYLOAD_TYPE IN
    ('STARTING', 'REQUEST', 'RESPONSE', 'ERROR', 'INTERCHANGE', 'TRANSFORMED', 'ATTACHMENT', 'FINAL_REQUEST')),
  CONSTRAINT CHK_MON_PAYLOAD_REPR CHECK (REPRESENTATION IN ('TEXT', 'BINARY'))
)
PARTITION BY RANGE (CAPTURED_AT) (
  PARTITION '2026-01-01' <= VALUES < '2026-02-01',
  PARTITION '2026-02-01' <= VALUES < '2026-03-01',
  PARTITION OTHERS
);

CREATE INDEX IX_MON_PAYLOAD_MESSAGE ON MON_PAYLOAD (MESSAGE_ID);
CREATE INDEX IX_MON_PAYLOAD_TYPE ON MON_PAYLOAD (PAYLOAD_TYPE);


-- =====================================================================
-- MON_HEADER — array-shaped in JSON, PK doubles as natural dedup key.
-- =====================================================================
CREATE COLUMN TABLE MON_HEADER (
  MESSAGE_ID        NVARCHAR(36)   NOT NULL,
  HEADER_NAME         NVARCHAR(128)  NOT NULL,
  HEADER_VALUE          NVARCHAR(1024),
  CATEGORY                NVARCHAR(20),
  SOURCE                    NVARCHAR(20),
  CREATED_AT                 TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_HEADER PRIMARY KEY (MESSAGE_ID, HEADER_NAME),
  CONSTRAINT FK_MON_HEADER_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_HEADER_CATEGORY CHECK (CATEGORY IS NULL OR CATEGORY IN ('SAP', 'FRAMEWORK', 'CUSTOM'))
);


-- =====================================================================
-- MON_PROPERTY — same array/natural-key pattern as MON_HEADER.
-- =====================================================================
CREATE COLUMN TABLE MON_PROPERTY (
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  PROPERTY_NAME          NVARCHAR(128)  NOT NULL,
  PROPERTY_VALUE            NVARCHAR(1024),
  CATEGORY                    NVARCHAR(20),
  SOURCE                        NVARCHAR(20),
  CREATED_AT                     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_PROPERTY PRIMARY KEY (MESSAGE_ID, PROPERTY_NAME),
  CONSTRAINT FK_MON_PROPERTY_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_PROPERTY_CATEGORY CHECK (CATEGORY IS NULL OR CATEGORY IN ('BUSINESS', 'MONITORING', 'DEVELOPER_DEFINED'))
);


-- =====================================================================
-- MON_FAILURE_EVIDENCE — the "why" behind failure.classification.
-- App-generated PK (never a DB identity) for idempotent replay.
-- =====================================================================
CREATE COLUMN TABLE MON_FAILURE_EVIDENCE (
  EVIDENCE_ID        NVARCHAR(36)   NOT NULL,
  MESSAGE_ID           NVARCHAR(36)   NOT NULL,
  EVIDENCE_TYPE          NVARCHAR(32)   NOT NULL,
  EVIDENCE_NAME             NVARCHAR(128)  NOT NULL,
  EVIDENCE_VALUE              NVARCHAR(1024),
  SOURCE                         NVARCHAR(20),
  CREATED_AT                       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_FAILURE_EVIDENCE PRIMARY KEY (EVIDENCE_ID),
  CONSTRAINT FK_MON_FAILURE_EVIDENCE_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_FAILURE_EVIDENCE_MESSAGE ON MON_FAILURE_EVIDENCE (MESSAGE_ID);


-- =====================================================================
-- MON_ERROR — MPL-exclusive structured error detail (distinct from the
-- Groovy-captured failureEvidence above; this is backfilled by the
-- Reconciliation & Forensic Backfill Job, §8.4 Job B, from MPL's own
-- ErrorInformation entity — Groovy has no visibility into this at all).
-- =====================================================================
CREATE COLUMN TABLE MON_ERROR (
  ERROR_ID            NVARCHAR(36)   NOT NULL,
  MESSAGE_ID            NVARCHAR(36)   NOT NULL,
  ERROR_CODE               NVARCHAR(32),
  ERROR_CATEGORY              NVARCHAR(32),
  ERROR_MESSAGE                 NVARCHAR(2000)  NOT NULL,
  EXCEPTION_TYPE                  NVARCHAR(256),
  STACK_TRACE                       NCLOB,
  COMPONENT_NAME                      NVARCHAR(128),
  CREATED_AT                            TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_ERROR PRIMARY KEY (ERROR_ID),
  CONSTRAINT FK_MON_ERROR_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_ERROR_MESSAGE ON MON_ERROR (MESSAGE_ID);


-- =====================================================================
-- MON_ADAPTER_ATTRIBUTE — MPL's own AdapterAttributes entity.
-- =====================================================================
CREATE COLUMN TABLE MON_ADAPTER_ATTRIBUTE (
  ATTRIBUTE_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_ID              NVARCHAR(36)   NOT NULL,
  ADAPTER_ID                 NVARCHAR(64),
  ADAPTER_MESSAGE_ID            NVARCHAR(128),
  ATTRIBUTE_NAME                   NVARCHAR(128)  NOT NULL,
  ATTRIBUTE_VALUE                     NVARCHAR(1024),
  CREATED_AT                             TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_ADAPTER_ATTRIBUTE PRIMARY KEY (ATTRIBUTE_ID),
  CONSTRAINT FK_MON_ADAPTER_ATTRIBUTE_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_ADAPTER_ATTRIBUTE_MESSAGE ON MON_ADAPTER_ATTRIBUTE (MESSAGE_ID);


-- =====================================================================
-- MON_ATTACHMENT
-- =====================================================================
CREATE COLUMN TABLE MON_ATTACHMENT (
  ATTACHMENT_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_ID               NVARCHAR(36)   NOT NULL,
  NAME                       NVARCHAR(256)  NOT NULL,
  CONTENT_TYPE                  NVARCHAR(64),
  SIZE_BYTES                       BIGINT,
  AVAILABLE                          BOOLEAN        NOT NULL DEFAULT TRUE,
  IS_BINARY                          BOOLEAN        NOT NULL DEFAULT TRUE,
  IS_TRUNCATED                         BOOLEAN        NOT NULL DEFAULT FALSE,
  CONTENT_TEXT                           NCLOB,
  CONTENT_BINARY                            BLOB,
  CREATED_AT                                  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_ATTACHMENT PRIMARY KEY (ATTACHMENT_ID),
  CONSTRAINT FK_MON_ATTACHMENT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_ATTACHMENT_MESSAGE ON MON_ATTACHMENT (MESSAGE_ID);


-- =====================================================================
-- MON_EVENT — portal lifecycle timeline. INSERT-only.
-- =====================================================================
CREATE COLUMN TABLE MON_EVENT (
  EVENT_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  EVENT_TYPE             NVARCHAR(64)   NOT NULL,
  EVENT_TIME                TIMESTAMP      NOT NULL,
  SOURCE                       NVARCHAR(32),
  FLOW_NAME                      NVARCHAR(256),
  QUEUE_NAME                        NVARCHAR(128),
  OLD_STATUS                          NVARCHAR(20),
  NEW_STATUS                            NVARCHAR(20),
  DESCRIPTION                              NVARCHAR(512),
  CREATED_AT                                 TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_EVENT PRIMARY KEY (EVENT_ID),
  CONSTRAINT FK_MON_EVENT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
)
PARTITION BY RANGE (EVENT_TIME) (
  PARTITION '2026-01-01' <= VALUES < '2026-02-01',
  PARTITION '2026-02-01' <= VALUES < '2026-03-01',
  PARTITION OTHERS
);

CREATE INDEX IX_MON_EVENT_MESSAGE ON MON_EVENT (MESSAGE_ID);
CREATE INDEX IX_MON_EVENT_TYPE_TIME ON MON_EVENT (EVENT_TYPE, EVENT_TIME);


-- =====================================================================
-- MON_RUN — MPL's own processing-run entity (Runs).
-- =====================================================================
CREATE COLUMN TABLE MON_RUN (
  RUN_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_ID        NVARCHAR(36)   NOT NULL,
  RUN_NUMBER          INTEGER        NOT NULL,
  STARTED_AT             TIMESTAMP      NOT NULL,
  ENDED_AT                  TIMESTAMP,
  DURATION_MS                  BIGINT,
  LOG_LEVEL                       NVARCHAR(10),
  PROCESS_ID                         NVARCHAR(64),
  STATUS                                NVARCHAR(20)   NOT NULL,
  CREATED_AT                              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_RUN PRIMARY KEY (RUN_ID),
  CONSTRAINT FK_MON_RUN_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_RUN_MESSAGE ON MON_RUN (MESSAGE_ID);


-- =====================================================================
-- MON_MESSAGE_STORE_ENTRY — MPL's own Message Store entries
-- (created by Persist steps). Not the Global Data Store buffer —
-- do not confuse the two.
-- =====================================================================
CREATE COLUMN TABLE MON_MESSAGE_STORE_ENTRY (
  ENTRY_ID          NVARCHAR(64)   NOT NULL,
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  MESSAGE_STORE_ID       NVARCHAR(64)   NOT NULL,
  ENTRY_TIMESTAMP           TIMESTAMP      NOT NULL,
  HAS_ATTACHMENTS              BOOLEAN        NOT NULL DEFAULT FALSE,
  CREATED_AT                      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_MESSAGE_STORE_ENTRY PRIMARY KEY (ENTRY_ID),
  CONSTRAINT FK_MON_MESSAGE_STORE_ENTRY_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);

CREATE INDEX IX_MON_MESSAGE_STORE_ENTRY_MESSAGE ON MON_MESSAGE_STORE_ENTRY (MESSAGE_ID);
```

### 9.2 Framework context tables

One table per framework, each keyed by `MESSAGE_ID` (per-hop, matching §5's design — a message has at most one context row per framework, on the framework that actually claimed it).

```sql
-- =====================================================================
-- MON_JMS_CONTEXT
-- =====================================================================
CREATE COLUMN TABLE MON_JMS_CONTEXT (
  MESSAGE_ID              NVARCHAR(36)   NOT NULL,
  QUEUE_NAME                 NVARCHAR(128),
  QUEUE_ROLE                    NVARCHAR(10),
  DLQ_NAME                         NVARCHAR(128),
  RESOLUTION_SOURCE                   NVARCHAR(20),
  RESOLUTION_SOURCE_FIELD                NVARCHAR(64),
  MANUAL_FALLBACK_USED                      BOOLEAN        NOT NULL DEFAULT FALSE,
  INGRESS_FLOW                                 NVARCHAR(256),
  EGRESS_FLOW                                     NVARCHAR(256),
  CREATED_AT                                        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_JMS_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_JMS_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_JMS_QUEUE_ROLE CHECK (QUEUE_ROLE IS NULL OR QUEUE_ROLE IN ('MAIN', 'DLQ'))
);


-- =====================================================================
-- MON_TPM_CONTEXT — per-hop TPM view.
-- =====================================================================
CREATE COLUMN TABLE MON_TPM_CONTEXT (
  MESSAGE_ID              NVARCHAR(36)   NOT NULL,
  INTERCHANGE_ID              NVARCHAR(64)   NOT NULL,
  SENDER_PARTNER                  NVARCHAR(128),
  RECEIVER_PARTNER                    NVARCHAR(128),
  DOCUMENT_TYPE                          NVARCHAR(32),
  PROCESSING_STAGE                          NVARCHAR(64),
  PROCESSING_DIRECTION                         NVARCHAR(10),
  QUEUE_RESOLUTION_STRATEGY                       NVARCHAR(20),
  CURRENT_QUEUE                                      NVARCHAR(128),
  QUEUE_ROLE                                            NVARCHAR(10),
  CREATED_AT                                              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                                TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_TPM_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_TPM_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_TPM_QUEUE_ROLE CHECK (QUEUE_ROLE IS NULL OR QUEUE_ROLE IN ('MAIN', 'DLQ')),
  CONSTRAINT CHK_MON_TPM_STRATEGY CHECK (QUEUE_RESOLUTION_STRATEGY IS NULL OR QUEUE_RESOLUTION_STRATEGY IN
    ('PAYLOAD_HINT', 'QUEUE_PROBE'))
);

CREATE INDEX IX_MON_TPM_CONTEXT_INTERCHANGE ON MON_TPM_CONTEXT (INTERCHANGE_ID);


-- =====================================================================
-- MON_TPM_INTERCHANGE — read-optimization only, NOT a source of truth.
-- Materialized/upserted by the Central Persistence iFlow as hops
-- arrive; the per-hop MON_TPM_CONTEXT rows above remain authoritative.
-- Query-vs-materialize is a deliberate tradeoff — see §12.
-- =====================================================================
CREATE COLUMN TABLE MON_TPM_INTERCHANGE (
  INTERCHANGE_ID          NVARCHAR(64)   NOT NULL,
  INTERCHANGE_TYPE            NVARCHAR(32),
  INTERCHANGE_VERSION            NVARCHAR(16),
  SENDER_PARTNER                    NVARCHAR(128),
  RECEIVER_PARTNER                     NVARCHAR(128),
  DOCUMENT_COUNT                          INTEGER,
  INTERCHANGE_STATUS                         NVARCHAR(20),
  FIRST_HOP_MESSAGE_ID                          NVARCHAR(36),
  LAST_HOP_MESSAGE_ID                              NVARCHAR(36),
  CREATED_AT                                          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                            TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_TPM_INTERCHANGE PRIMARY KEY (INTERCHANGE_ID)
);


-- =====================================================================
-- MON_ROUTER_CONTEXT — Common IDoc Router.
-- =====================================================================
CREATE COLUMN TABLE MON_ROUTER_CONTEXT (
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  SNDPRN                 NVARCHAR(64),
  RCVPRN                    NVARCHAR(64),
  IDOCTYP                      NVARCHAR(64),
  MESTYP                          NVARCHAR(64),
  ROUTING_STATUS                     NVARCHAR(20),
  ROUTING_ERROR                         NVARCHAR(512),
  CURRENT_QUEUE                            NVARCHAR(128),
  QUEUE_ROLE                                  NVARCHAR(10),
  CREATED_AT                                     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_ROUTER_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_ROUTER_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_ROUTER_QUEUE_ROLE CHECK (QUEUE_ROLE IS NULL OR QUEUE_ROLE IN ('MAIN', 'DLQ'))
);

CREATE INDEX IX_MON_ROUTER_CONTEXT_SNDPRN_RCVPRN ON MON_ROUTER_CONTEXT (SNDPRN, RCVPRN);


-- =====================================================================
-- MON_STATUS_SYNC_CONTEXT — IDoc Status Sync.
-- =====================================================================
CREATE COLUMN TABLE MON_STATUS_SYNC_CONTEXT (
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  IDOC_NUMBER            NVARCHAR(32)   NOT NULL,
  PREVIOUS_STATUS           NVARCHAR(4),
  CURRENT_STATUS               NVARCHAR(4),
  TARGET_STATUS                    NVARCHAR(4),
  ACKNOWLEDGEMENT_TYPE                NVARCHAR(10),
  CURRENT_QUEUE                          NVARCHAR(128),
  QUEUE_ROLE                                NVARCHAR(10),
  CREATED_AT                                   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_STATUS_SYNC_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_STATUS_SYNC_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_STATUS_SYNC_QUEUE_ROLE CHECK (QUEUE_ROLE IS NULL OR QUEUE_ROLE IN ('MAIN', 'DLQ'))
);

CREATE INDEX IX_MON_STATUS_SYNC_CONTEXT_IDOC ON MON_STATUS_SYNC_CONTEXT (IDOC_NUMBER);


-- =====================================================================
-- MON_UNKNOWN_CONTEXT — UNKNOWN / NON_FRAMEWORK, including manual
-- reassignment history.
-- =====================================================================
CREATE COLUMN TABLE MON_UNKNOWN_CONTEXT (
  MESSAGE_ID          NVARCHAR(36)   NOT NULL,
  REASON                 NVARCHAR(512)  NOT NULL,
  EVIDENCE_CHECKED           NVARCHAR(512),
  SUGGESTED_FRAMEWORK           NVARCHAR(32),
  MANUAL_FRAMEWORK                 NVARCHAR(32),
  ASSIGNED_BY                         NVARCHAR(128),
  ASSIGNED_AT                            TIMESTAMP,
  NOTES                                     NVARCHAR(1024),
  CREATED_AT                                  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_UNKNOWN_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_UNKNOWN_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID)
);
```

### 9.3 Recovery tables

```sql
-- =====================================================================
-- MON_RECOVERY_CONTEXT — current recoverability state. MERGE target.
-- =====================================================================
CREATE COLUMN TABLE MON_RECOVERY_CONTEXT (
  MESSAGE_ID              NVARCHAR(36)   NOT NULL,
  FRAMEWORK_TYPE              NVARCHAR(32)   NOT NULL,
  RECOVERY_STATUS                NVARCHAR(32)   NOT NULL DEFAULT 'NOT_APPLICABLE',
  RECOVERY_LAYER                     NVARCHAR(32),
  CURRENT_QUEUE                          NVARCHAR(128),
  QUEUE_ROLE                                NVARCHAR(10),
  SOURCE_QUEUE                                 NVARCHAR(128),
  TARGET_QUEUE                                    NVARCHAR(128),
  MANUAL_STEP_REQUIRED                               BOOLEAN        NOT NULL DEFAULT FALSE,
  RETENTION_GUARANTEE_DAYS                              INTEGER,
  RETRY_COUNT                                              INTEGER        NOT NULL DEFAULT 0,
  MAX_RETRIES                                                 INTEGER,
  MANUAL_QUEUE                                                   NVARCHAR(128),
  RECOVERY_METHOD                                                   NVARCHAR(32),
  DISCOVERY_METHOD                                                     NVARCHAR(32),
  LAST_OPERATION_ID                                                       NVARCHAR(64),
  CREATED_AT                                                                 TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT                                                                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_RECOVERY_CONTEXT PRIMARY KEY (MESSAGE_ID),
  CONSTRAINT FK_MON_RECOVERY_CONTEXT_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_RECOVERY_STATUS CHECK (RECOVERY_STATUS IN
    ('NOT_APPLICABLE', 'RECOVERABLE', 'RETRY_AVAILABLE', 'DLQ_RECOVERY_AVAILABLE', 'RETRYING',
     'NOT_FOUND', 'MANUAL_INVESTIGATION_REQUIRED', 'UNSUPPORTED', 'COMPLETED', 'FAILED_AGAIN')),
  CONSTRAINT CHK_MON_RECOVERY_LAYER CHECK (RECOVERY_LAYER IS NULL OR RECOVERY_LAYER IN
    ('JMS_QUEUE_DLQ', 'TPM_DLQ', 'COMMON_ROUTER_DLQ', 'STATUS_SYNC_DLQ')),
  CONSTRAINT CHK_MON_RECOVERY_QUEUE_ROLE CHECK (QUEUE_ROLE IS NULL OR QUEUE_ROLE IN ('MAIN', 'DLQ'))
);

CREATE INDEX IX_MON_RECOVERY_CONTEXT_STATUS ON MON_RECOVERY_CONTEXT (RECOVERY_STATUS);
CREATE INDEX IX_MON_RECOVERY_CONTEXT_FRAMEWORK ON MON_RECOVERY_CONTEXT (FRAMEWORK_TYPE);


-- =====================================================================
-- MON_RECOVERY_OPERATION — immutable audit trail. INSERT-only.
-- Every recovery attempt is a new row, never updated in place.
-- =====================================================================
CREATE COLUMN TABLE MON_RECOVERY_OPERATION (
  OPERATION_ID          NVARCHAR(64)   NOT NULL,
  MESSAGE_ID               NVARCHAR(36)   NOT NULL,
  FRAMEWORK_TYPE               NVARCHAR(32)   NOT NULL,
  ACTION                          NVARCHAR(20)   NOT NULL,
  SOURCE_QUEUE                       NVARCHAR(128),
  TARGET_QUEUE                          NVARCHAR(128),
  ATTEMPT_NUMBER                           INTEGER        NOT NULL DEFAULT 1,
  REQUESTED_BY                                NVARCHAR(128)  NOT NULL,
  REQUESTED_AT                                   TIMESTAMP      NOT NULL,
  COMPLETED_AT                                      TIMESTAMP,
  STATUS                                               NVARCHAR(20)   NOT NULL,
  RESULT                                                  NVARCHAR(2000),

  CONSTRAINT PK_MON_RECOVERY_OPERATION PRIMARY KEY (OPERATION_ID),
  CONSTRAINT FK_MON_RECOVERY_OPERATION_MESSAGE FOREIGN KEY (MESSAGE_ID) REFERENCES MON_MESSAGE (MESSAGE_ID),
  CONSTRAINT CHK_MON_RECOVERY_OP_ACTION CHECK (ACTION IN ('MOVE', 'RETRY', 'MOVE_THEN_RETRY')),
  CONSTRAINT CHK_MON_RECOVERY_OP_STATUS CHECK (STATUS IN
    ('ACCEPTED', 'SUCCESSFUL', 'ALREADY_PROCESSED', 'FAILED', 'UNAVAILABLE'))
)
PARTITION BY RANGE (REQUESTED_AT) (
  PARTITION '2026-01-01' <= VALUES < '2026-02-01',
  PARTITION '2026-02-01' <= VALUES < '2026-03-01',
  PARTITION OTHERS
);

CREATE INDEX IX_MON_RECOVERY_OPERATION_MESSAGE ON MON_RECOVERY_OPERATION (MESSAGE_ID);
CREATE INDEX IX_MON_RECOVERY_OPERATION_STATUS_TIME ON MON_RECOVERY_OPERATION (STATUS, REQUESTED_AT);

-- Concurrency guard: two operators recovering the same message must
-- not both proceed. An atomic HANA-level lock, backing the same
-- guarantee the backend's in-memory RecoveryLockStore provides for a
-- single process — this is what makes it correct across multiple
-- backend instances (see §12, item 3).
CREATE COLUMN TABLE MON_RECOVERY_LOCK (
  MESSAGE_ID        NVARCHAR(36)   NOT NULL,
  LOCKED_BY            NVARCHAR(128)  NOT NULL,
  LOCKED_AT               TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT PK_MON_RECOVERY_LOCK PRIMARY KEY (MESSAGE_ID)
);
-- Acquire:  INSERT INTO MON_RECOVERY_LOCK (...) — a second concurrent
--           INSERT for the same MESSAGE_ID violates the PK and fails,
--           which the backend maps to 409 Conflict.
-- Release:  DELETE FROM MON_RECOVERY_LOCK WHERE MESSAGE_ID = ?
-- Stale-lock reclaim: a scheduled job deletes rows older than the
--           configured staleness window (mirrors the in-memory
--           store's LOCK_STALE_MS).
```

### 9.4 Persistence observability

```sql
-- =====================================================================
-- MON_PERSISTENCE_OPERATION — the persistence pipeline's own audit
-- trail, entirely separate from business recovery (§8.6). INSERT-only.
-- =====================================================================
CREATE COLUMN TABLE MON_PERSISTENCE_OPERATION (
  OPERATION_ID          NVARCHAR(64)   NOT NULL,
  MESSAGE_ID               NVARCHAR(36)   NOT NULL,
  BATCH_ID                    NVARCHAR(64),
  ATTEMPT_NUMBER                  INTEGER        NOT NULL DEFAULT 1,
  STATUS                             NVARCHAR(10)   NOT NULL,
  ERROR_MESSAGE                         NVARCHAR(2000),
  STARTED_AT                               TIMESTAMP      NOT NULL,
  COMPLETED_AT                                TIMESTAMP,

  CONSTRAINT PK_MON_PERSISTENCE_OPERATION PRIMARY KEY (OPERATION_ID),
  CONSTRAINT CHK_MON_PERSISTENCE_OP_STATUS CHECK (STATUS IN
    ('PENDING', 'PROCESSING', 'PERSISTED', 'RETRYING', 'FAILED', 'DLQ'))
  -- No FK to MON_MESSAGE: a persistence failure can happen BEFORE the
  -- MON_MESSAGE row itself exists (the whole batch write failed), so
  -- this table must be able to record that independently.
)
PARTITION BY RANGE (STARTED_AT) (
  PARTITION '2026-01-01' <= VALUES < '2026-02-01',
  PARTITION '2026-02-01' <= VALUES < '2026-03-01',
  PARTITION OTHERS
);

CREATE INDEX IX_MON_PERSISTENCE_OPERATION_MESSAGE ON MON_PERSISTENCE_OPERATION (MESSAGE_ID);
CREATE INDEX IX_MON_PERSISTENCE_OPERATION_STATUS ON MON_PERSISTENCE_OPERATION (STATUS);
CREATE INDEX IX_MON_PERSISTENCE_OPERATION_BATCH ON MON_PERSISTENCE_OPERATION (BATCH_ID);
```

---

## 10. Persistence Semantics

### 10.1 MERGE vs INSERT, by table

| Current-state (UPSERT) | Historical / audit (INSERT-only) |
|---|---|
| `MON_MESSAGE` | `MON_PAYLOAD` |
| `MON_JMS_CONTEXT` / `MON_TPM_CONTEXT` / `MON_ROUTER_CONTEXT` / `MON_STATUS_SYNC_CONTEXT` / `MON_UNKNOWN_CONTEXT` | `MON_HEADER` / `MON_PROPERTY` (natural-key upsert is acceptable — same header value replayed is a no-op) |
| `MON_TPM_INTERCHANGE` | `MON_ATTACHMENT` |
| `MON_RECOVERY_CONTEXT` | `MON_ERROR` / `MON_ADAPTER_ATTRIBUTE` / `MON_RUN` / `MON_MESSAGE_STORE_ENTRY` |
| | `MON_EVENT` / `MON_FAILURE_EVIDENCE` |
| | `MON_MESSAGE_DATA_SOURCE` (natural-key upsert — a writer re-recording its own source is a no-op) |
| | `MON_RECOVERY_OPERATION` / `MON_PERSISTENCE_OPERATION` |

### 10.2 Idempotency

Primary identity is `MESSAGE_ID` (app-generated UUID, unique per hop); `MPL_ID` carries a `UNIQUE` constraint as the secondary check once reconciled. Because every id in the envelope is generated by Groovy/the Persistence Framework — never by the database — a replayed batch (e.g. after a CPI timeout mid-commit followed by an automatic retry) simply re-issues the same primary keys:

```text
Data Store → JDBC → HANA COMMIT → CPI timeout (ack never received)
     → CPI retries the same batch → same MESSAGE_ID/child ids
     → UPSERT is a no-op on the already-committed row
```

Concrete HANA UPSERT pattern respecting the ownership matrix (§3.2) — each writer's statement only ever names its own columns. **v1.2 change: Groovy's write is the real terminal write for `STATUS`, not a placeholder** — it only runs once, from whichever branch (success end or exception subprocess) actually executed §8.1a's final collection step:

```sql
-- Groovy — including STATUS/STATUS_SOURCE, which it now owns directly (§2, §3.2).
-- This is the terminal write for these columns under normal operation; the
-- Reconciliation Job below only ever adds STATUS_VERIFIED/STATUS_DISCREPANCY,
-- never touching STATUS itself.
UPSERT MON_MESSAGE (
    MESSAGE_ID, HOP_SEQUENCE, HOP_NAME, HOP_TYPE, CAPTURED_BY,
    STATUS, STATUS_SOURCE, LOG_START, LOG_END,
    SENDER, RECEIVER, INTEGRATION_FLOW_NAME,
    INTEGRATION_PACKAGE_ID, INTEGRATION_PACKAGE_NAME, ARTIFACT_VERSION,
    LOG_LEVEL, CUSTOM_STATUS, LAST_ERROR_STEP, LAST_SUCCESSFUL_STEP,
    PROCESSING_STARTED, PROCESSING_COMPLETED,
    FRAMEWORK_TYPE, FRAMEWORK_DETECTED_BY, FRAMEWORK_CONFIDENCE,
    FAILURE_DETECTED, FAILURE_CLASSIFICATION, FAILURE_SEVERITY, FAILURE_ACTIONABLE,
    FAILURE_CONFIDENCE, FAILURE_REASON,
    SOP_CONFIGURATION_ID, BUSINESS_DOMAIN, BUSINESS_PROCESS, SUPPORT_TEAM,
    SUPPORT_CONTACT, CRITICALITY, EXPECTED_PROCESSING_TYPE,
    UPSTREAM_ALREADY_CAPTURED, UPSTREAM_CAPTURE_CONFIRMATION_HEADER,
    ENVIRONMENT, REGION, TENANT_NAME, TENANT_URL,
    CREATED_AT, UPDATED_AT
  )
  VALUES (
    :messageId, :hopSequence, :hopName, :hopType, 'GROOVY_RUNTIME',
    :status, 'GROOVY_ASSERTED', :logStart, :logEnd,
    :sender, :receiver, :flowName,
    :packageId, :packageName, :artifactVersion,
    :logLevel, :customStatus, :lastErrorStep, :lastSuccessfulStep,
    :processingStarted, :processingCompleted,
    :frameworkType, :detectedBy, :confidence,
    :failureDetected, :failureClassification, :failureSeverity, :failureActionable,
    :failureConfidence, :failureReason,
    :sopConfigId, :businessDomain, :businessProcess, :supportTeam,
    :supportContact, :criticality, :expectedProcessingType,
    :upstreamAlreadyCaptured, :upstreamCaptureConfirmationHeader,
    :environment, :region, :tenantName, :tenantUrl,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  WITH PRIMARY KEY;

-- Reconciliation Job, Job A (§8.4) — flag-only. Never names STATUS.
UPDATE MON_MESSAGE
  SET STATUS_VERIFIED = TRUE,
      STATUS_DISCREPANCY = :discrepancyOrNull,   -- NULL when it actually matched
      MPL_ID = :mplId,
      UPDATED_AT = CURRENT_TIMESTAMP
  WHERE MESSAGE_ID = :messageId;

-- Reconciliation Job, Job B (§8.4) — forensic backfill only. Uses COALESCE so a
-- value Groovy already captured is never clobbered by a later MPL read.
UPDATE MON_MESSAGE
  SET LOG_START = COALESCE(LOG_START, :mplLogStart),
      LOG_END = COALESCE(LOG_END, :mplLogEnd),
      SENDER = COALESCE(SENDER, :mplSender),
      RECEIVER = COALESCE(RECEIVER, :mplReceiver),
      UPDATED_AT = CURRENT_TIMESTAMP
  WHERE MESSAGE_ID = :messageId;

-- The ONE exception: a gap-fill row with no Groovy record at all
-- (TPM black box, or a message where Groovy never ran — §8.4). Here the
-- Reconciliation Job is the only writer that will ever exist, so it takes
-- STATUS directly from the real MPL status — there is no Groovy assertion
-- to defer to, and this is the documented, honest exception to "Groovy owns
-- STATUS" rather than a silent inconsistency.
UPSERT MON_MESSAGE (
    MESSAGE_ID, MPL_ID, CORRELATION_ID, CAPTURED_BY, STATUS, STATUS_SOURCE,
    STATUS_VERIFIED, LOG_START, LOG_END, INTEGRATION_FLOW_NAME, CREATED_AT, UPDATED_AT
  )
  VALUES (
    :messageId, :mplId, :correlationId, 'MPL_COLLECTOR_ONLY', :mplStatus, 'MPL_COLLECTOR_ONLY',
    TRUE, :logStart, :logEnd, :flowName, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  WITH PRIMARY KEY;
```

Because no statement names a column another writer owns, running them in any order — or replaying any one of them — never overwrites another writer's data with `NULL`, and the Reconciliation Job can never silently change what Groovy already asserted.

---

## 11. Validation Rules

Enforced by the Central Persistence iFlow before any write; a failure is recorded (§8.3), never silently dropped.

**Always required:**
```text
message.messageId
message.integrationFlowName
message.environment
message.status          (Groovy asserts this directly at capture time, §8.1a —
                          the only exception is a pure gap-fill row with no
                          Groovy record at all, §7.4, where the Reconciliation
                          Job supplies it straight from real MPL status instead)
framework.type
framework.detectedBy
framework.confidence
schemaVersion
```

**Framework-conditional:**
```text
TPM_V2              → framework.context.interchangeId required
JMS_FRAMEWORK        → framework.context.queueResolution required if resolved=true
COMMON_IDOC_ROUTER   → framework.context.sndprn/.rcvprn required if available
IDOC_STATUS_SYNC     → framework.context.idocNumber required
UNKNOWN               → framework.context.reason required
```

**Payload-conditional (§4.7, §9.1's truncation note):**
```text
payloads[].isTruncated = true  → payloads[].originalSizeBytes and .storedSizeBytes both required
                                  (an operator must be able to see exactly how much was cut)
```

---

## 12. Open Items & Assumptions

**New in v1.2 (STATUS ownership revision, §2):**

1. **The Reconciliation Job's staleness window is not yet defined.** Job A (§8.4) needs a concrete answer to "how long after `createdAt` should a row wait before being checked against real MPL status" — too short and it fires before MPL has the entry at all (guaranteed false discrepancies); too long and a genuinely wrong `STATE` sits unflagged for longer than necessary. This should be set from the tenant's own observed MPL-availability latency, not guessed.
2. **A discrepancy is surfaced to the UI, but the exact treatment isn't designed yet.** §8.4/§4.1 establish that `STATUS_DISCREPANCY` is set and `STATUS` is never touched — but whether the Message Investigation Workspace shows this as a dismissible warning, a required-acknowledgment flag, or something an operator can resolve (and how that resolution is recorded) is UI/UX scope this document doesn't cover.
3. **The `EVENT-NNN` header/property namespace needs a collision rule.** If two Groovy steps in parallel branches (e.g. a multicast, §8.5.3) both write `EVENT-003` before either sees the other's value, the final collection step (§8.1a) needs a deterministic tie-break (timestamp order within the same number, or a documented convention that parallel branches use disjoint number ranges) — not specified yet.
4. **What happens to a message where even the exception subprocess doesn't run** (the true infrastructure-failure case, §2's gap #2) is entirely dependent on Job B's backfill cadence — such a message is invisible in the portal until that job's next run, not real-time. Whether that gap is acceptable, or needs its own faster-polling tier, is a product decision, not a schema one.

**Carried over from v1.1:**

5. **HANA partition DDL must be validated against the target service plan.** The `PARTITION BY RANGE` blocks in §9 show 2–3 example monthly partitions plus a catch-all `OTHERS` partition — a scheduled job must add new month partitions ahead of time; this file does not attempt to enumerate them indefinitely.
6. **`MON_TPM_INTERCHANGE` is a materialized read convenience, not a new source of truth** — per-hop `MON_TPM_CONTEXT` rows remain authoritative. If this proves to add more merge-conflict risk than read-performance value, it can be dropped in favor of a `GROUP BY INTERCHANGE_ID` query.
7. **`MON_RECOVERY_LOCK` is the multi-instance-safe version of the backend's existing in-memory `RecoveryLockStore`.** If/when the backend moves to this table, the lock semantics (acquire via `INSERT`, PK violation ⇒ 409, staleness reclaim job) should exactly mirror the in-memory store's existing contract so callers see no behavior change.
8. **Retention sizing is not yet done.** Before finalizing partition sizes, capture: messages/day, average/95th-percentile/max payload size, attachments/day, and 90-day projected volume.
9. **`recovery.manualStepRequired` for Common IDoc Router is a temporary state**, not a permanent architectural constraint — once the portal automates the DLQ-to-main move for this framework, the flag flips to `false` with no schema change required.
10. **CHECK constraints assume HANA Cloud.** Older on-premise HANA versions may need equivalent enforcement moved to the Persistence Framework's validation step (§11) instead of the DDL layer.
11. **`monitoring.source`/`monitoring.sourceType` are constants in v1** (`"SAP_CPI"`/`"MPL"`), not persisted as columns — reserved as a multi-source extension point (§4.4) should a second monitoring input ever exist.
12. **`sop.alertPolicy` and the `businessIdentifiers[]`/`headerAllowList[]`/`propertyAllowList[]` arrays are transport-only** — they steer Groovy's own capture/alerting behavior and are deliberately not persisted per transaction, matching the same "static config doesn't belong on every row" rule already applied to DLQ topology (§6.2). If per-transaction audit of *which* policy version ran becomes a real requirement, `sop.configurationId` (already persisted) is the intended join key back to wherever that policy is versioned — not a reason to duplicate the policy body itself onto every row.
13. **Common IDoc Router and IDoc Status Sync ship with no configured detection rules** (§7.9, §7.10 both show `detectedBy: "QUEUE_EVIDENCE"`) — both are reached only by being found on their own queues. If/when their real iFlow-name or header signals are confirmed, `framework.detectedBy` for those frameworks can start reporting `"CONFIGURATION"` with no schema change.
