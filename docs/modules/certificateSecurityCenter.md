# Certificate & Security Center (Phase 13)

A complete operational workspace for certificate health, the Certificate Explorer, Security
Materials and per-certificate Timeline.

## Architecture — consumes only the Operations Engine

```
Certificate & Security Center (this module)
   ↓ HTTP: GET/POST /api/v1/certificate-security-center/*
Certificate Security Center module (srv/src/modules/certificate-security-center)  ← composes the DTOs
   ↓
Operations Engine → CertificateSecurityEngine (srv/src/operations/engines/CertificateSecurityEngine.ts)
   ↓ (the existing CertificateEngine, Phase 6 — never modified)
Integration Suite SDK → SAP Integration Suite
```

The UI never talks to the SDK, never knows a `KeystoreEntries` entity-set name — only the Certificate
Security DTOs ([`service/CertificateSecurityCenterTypes.ts`](service/CertificateSecurityCenterTypes.ts)),
fetched through [`CertificateSecurityCenterService`](service/CertificateSecurityCenterService.ts).

## Honesty about data availability

This phase's spec explicitly requires that Integration Suite data never be fabricated. SAP
Integration Suite's `KeystoreEntries` OData entity set — this SDK's only certificate data source —
carries exactly: alias, key type, owner, issuer, valid-from/to, serial number. Everything this
workspace shows beyond that is one of three honestly-labeled things:

- **Real, derived data** — days remaining, health, and the Security Materials `keystore` count are
  all computed directly from real fields.
- **Documented heuristics** — `selfSigned` (`owner === issuer`, `undefined` when either is missing)
  and `weakAlgorithm` (a known-weak substring match against `keyType`) are approximations computed
  from real fields, never certainties. `riskScore` is a documented heuristic built from these plus
  expiry proximity.
- **Reserved extension points** — `subject`, `fingerprint`, `signatureAlgorithm`,
  `usedByIntegrationFlows`, `usedByDestinations`, and four of the five Security Material categories
  (OAuth Credentials, Trust Store, SSH Keys, PGP Keys) have no data source anywhere in this SDK. They
  are always `undefined`/empty/unavailable, each with a `reason` string naming the extension point a
  future phase would add (e.g. a new `IOAuthCredentialProvider` contract mirroring
  `ICertificateProvider`'s own shape) — never filled with invented data.

## Sections

- **Certificate Dashboard** — certificate health, expiring/expired certificates, a security summary
  and an aggregate health score (itself derived from the real per-certificate risk scores).
- **Certificate Explorer** — search, sorting, and Smart Filters (Expiring 7/30 Days, Expired, Self
  Signed, Weak Algorithm), all applied client-side over the enriched certificate list. Selecting a row
  opens the Certificate Details panel with two tabs:
  - **Details** — issuer, owner, validity, serial number, key type, the self-signed/weak-algorithm
    heuristics, risk score, the reserved subject/fingerprint/signature-algorithm fields (rendered as
    "Not available" rather than blank), and Impact Analysis (affected iFlows/destinations — honestly
    reported as unavailable, with a visible `MessageStrip` explaining why).
  - **Timeline** — see below.
- **Security Materials** — one row per category; only Keystore is available (backed by real data);
  the other four report their unavailability and reserved extension point.
- **Timeline** — session-only (`CertificateSecurityStateStore`, a process-lifetime singleton
  mirroring Recovery/Runtime Center's own state stores), seeded with real "Imported"
  (`validFrom`)/"Expiring"or"Expired" (`validTo`) milestones the first time a certificate's timeline
  is opened. "Flag for Renewal" is the one genuinely mutating action this domain supports —
  `ICertificateProvider` is read-only by design, so there is no real renew/replace CPI action to wire
  up.
- **Related Navigation** — Runtime Center, Message Investigation, Payload Studio.

## Permissions

- `PI_CERTIFICATE_VIEWER` — gates the module itself (already existed in `RoleCollections.ts` from an
  earlier phase; reused, not re-declared).
- `PI_CERTIFICATE_ADMIN` — required for "Flag for Renewal", enforced both client-side and server-side
  (`Operator` scope check in `certificate-security-center/routes.ts`, mirroring
  `CertificateAdmin`'s existing scope choice).

## Files

- `service/CertificateSecurityCenterTypes.ts` — client mirror of the backend DTOs.
- `service/CertificateSecurityCenterService.ts` — the only class allowed to call
  `/api/v1/certificate-security-center`.
- `model/CertificateSecurityCenterModel.ts` — the module's single view model.
- `formatter/CertificateSecurityCenterFormatter.ts` — health/risk-score/self-signed/weak-algorithm/
  availability/timeline-event → UI5 value states/icons; `health` delegates to
  `core/formatters/HealthFormatter` since it reuses the shared Operations Engine vocabulary verbatim.
- `controller/CertificateSecurityCenter.controller.ts` — orchestration only: loads the dashboard,
  certificate list and security materials; loads a selected certificate's Details/Timeline; dispatches
  Flag for Renewal and Related Navigation. No business logic.
- `view/CertificateSecurityCenter.view.xml` — a resizable `sap.ui.layout.Splitter` (section tabs | a
  collapsible Certificate Details panel), mirroring the chrome established by Recovery/Runtime Center.
- `fragment/*.fragment.xml` — one fragment per section tab (Dashboard, Certificate Explorer, Security
  Materials) and per Certificate Details tab (Details, Timeline).
