# Connectivity Guide — switching the Integration Suite SDK from mock to real (Phase 5)

This guide is for an operator/deployer who wants to point the Integration Portal at an actual SAP
Integration Suite tenant. It does not require touching any module, controller, or SDK source file —
every switch described here is configuration- or environment-variable-driven.

## Recap: what Phase 5 changed

Phase 4 built the SDK's infrastructure (HTTP, auth, destination, OData, REST, request pipeline) and
wired every sub-client to a mock-data provider. Phase 5 added a **real** implementation of every
provider contract (`sdk/providers/Real*`, see `srv/src/sdk/providers/README.md`) built on that same
infrastructure, and a `providerMode` switch on `IntegrationSuiteSdkClient` that selects mock or real
per deployment. No UI, module, or provider *interface* changed.

## Step 1 — choose a destination discovery mode

Edit `config/connectivity.json`:

```json
{
  "mode": "real",
  "destinationDiscovery": "btp",
  "tenantAuth": []
}
```

| `destinationDiscovery` | When to use it |
|---|---|
| `"btp"` | **Recommended for deployed environments.** Destinations (base URL + credentials) are looked up live from the bound SAP BTP Destination service, keyed by each tenant's `destinationName` (`tenants.json`). No credential of any kind lives in this repository. |
| `"static"` | For local/direct testing against a tenant without a Destination service binding. Base URLs come from `tenants.json`; the auth *strategy* comes from `connectivity.json`'s `tenantAuth[]`; the actual secret comes from environment variables (Step 3). |

## Step 2 — `btp` discovery: bind the Destination service and set its credentials

1. Bind an instance of the SAP BTP **Destination** service to the application (Cloud Foundry:
   `cf bind-service <app> <destination-service-instance>`, or via `mta.yaml`/`xs-security.json` as
   this project's other bound services already are).
2. Ensure every tenant in `config/tenants.json` you intend to use in `real` mode has a
   `destinationName` pointing at a destination actually defined in the subaccount, with one of:
   - **Basic** authentication (`User`/`Password` on the destination), or
   - **OAuth2ClientCredentials** authentication (`clientId`/`clientSecret`/`tokenServiceURL` on the
     destination).

   Any other `Authentication` type on the destination is rejected with a `ConfigurationError` naming
   the unsupported type — the SDK fails fast rather than silently falling back to no auth.
3. Set the environment variables the SDK itself needs to call the Destination service's own API
   (these are genuinely secret and must **never** go in `config/*.json`):

   ```
   DESTINATION_SERVICE_URL=https://<subaccount>.dest-configuration.<landscape-domain>
   DESTINATION_SERVICE_TOKEN_URL=https://<subaccount>.authentication.<landscape-domain>/oauth/token
   DESTINATION_SERVICE_CLIENT_ID=<client id from the service binding>
   DESTINATION_SERVICE_CLIENT_SECRET=<client secret from the service binding>
   ```

   All four must be set together, or none at all (`srv/src/config/env.ts` throws at boot otherwise).

## Step 3 — `static` discovery: set per-tenant strategy and secrets

1. In `config/connectivity.json`, add one `tenantAuth` entry per tenant:

   ```json
   {
     "mode": "real",
     "destinationDiscovery": "static",
     "tenantAuth": [
       { "tenantId": "primary", "type": "oauth-client-credentials", "oauthTokenUrl": "https://<tenant>.authentication.<landscape>/oauth/token" }
     ]
   }
   ```

2. Set the matching secret as an environment variable, named `CPI_<TENANTID>_<KEY>` (tenant id
   upper-cased, non-alphanumeric characters replaced with `_`):

   | `type` | Required environment variables |
   |---|---|
   | `basic` | `CPI_<TENANTID>_USERNAME`, `CPI_<TENANTID>_PASSWORD` |
   | `oauth-client-credentials` | `CPI_<TENANTID>_CLIENT_ID`, `CPI_<TENANTID>_CLIENT_SECRET` |

   Example for tenant id `primary`: `CPI_PRIMARY_CLIENT_ID`, `CPI_PRIMARY_CLIENT_SECRET`.

## Step 4 — (optional) choose how JMS queues are discovered

`config/queues.json` declares a fixed list of expected queue names (with display names, DLQ/retry
pairings, priority and retry strategy). A real tenant's actual queue names rarely match a freshly
scaffolded `queues.json` — e.g. a trial tenant may expose only one queue (`PIPQ1`) while
`queues.json` still lists placeholder names from initial setup.

Set `JMS_QUEUE_DISCOVERY_MODE` to control which queues `QueueEngine.listQueues()` (JMS Queue
Management) returns:

| Value | Behaviour |
|---|---|
| `Fetch_Specific` (default) | Only the enabled queues listed in `config/queues.json` are checked. A queue on the tenant that isn't listed there is invisible to the platform — unchanged from every prior release. |
| `Fetch_All` | `config/queues.json`'s queue list (including `enabled`) is bypassed entirely. Every queue the tenant itself reports is discovered live. `queues.json` is still consulted as an optional overlay: a discovered queue whose name matches a config entry gets that entry's display name/DLQ/retry/priority metadata; one with no match gets honest defaults (its own name as display name, no DLQ/retry pairing, lowest priority, `manual` retry strategy). |

```
JMS_QUEUE_DISCOVERY_MODE=Fetch_All
```

This applies to JMS queue discovery only; it has no effect on other domains (Data Store, Partner
Directory, etc. are not modeled by this platform yet).

## Step 5 — (optional) wire the SAP Alert Notification Service

`RealAlertProvider` is only constructed when `AlertNotificationServiceConfig` (an ANS base URL + an
`IAuthProvider` for its own OAuth client) is supplied to `real.alertNotification` when calling
`createIntegrationSuiteSdkClient` / constructing `IntegrationSuiteSdkClient` directly. Without it,
alerts remain served by `MockAlertProvider` even in `real` mode — a deliberate fallback, not an
error, since ANS is a distinct, optional BTP service instance.

## Step 6 — verify

```bash
npm test --workspace=srv
```

runs the full suite, including `destination.test.ts` (BTP discovery mapping) and
`realProviders.test.ts` (every `Real*Provider` against a stubbed `IHttpClient` — no network access,
so this passes with or without a live tenant configured). Nothing in the automated test suite makes
a real network call; verifying actual tenant connectivity is a manual step against your own tenant.

## Where the wiring actually happens

`srv/src/config/sdkClientFactory.ts`'s `createIntegrationSuiteSdkClient()` reads
`ConfigService.getConnectivity()`/`getTenants()`, `env.destinationService`, and
`getTenantCredential()`, and builds the `IntegrationSuiteSdkClientOptions` described above — this is
the **only** place the platform's configuration format meets the SDK's own, config-agnostic
composition root (`IntegrationSuiteSdkClient`, `srv/src/sdk/client/README.md`). No module calls this
factory yet (no module consumes the SDK client at all in this phase, mirroring Phase 4) — a future
phase's module services call it once at startup.
