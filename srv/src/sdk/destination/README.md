# `sdk/destination/` — destination framework

Resolves a tenant id into a ready-to-call `TenantContext` (base URL + live auth headers)
(architecture: Destination Framework, §3). No SDK code hardcodes a tenant URL.

## Key types

| Type | Role |
|---|---|
| `IDestinationResolver` | `resolve({tenantId?, correlationId}) → TenantContext`. The seam the request pipeline depends on. |
| `DestinationResolver` | The implementation. Delegates *which destinations exist* to an `IDestinationDiscoveryProvider` and *how to authenticate each one* to `sdk/auth`'s `AuthProviderFactory`; caches one `IAuthProvider` instance per tenant so token caches persist across calls. |
| `IDestinationDiscoveryProvider` | `listDestinations() → DestinationDefinition[]`. Separates *discovery* from *resolution* so a static list can be replaced by a live BTP Destination-service lookup without touching `DestinationResolver`. |
| `StaticDestinationDiscoveryProvider` | An in-memory, caller-supplied list — used for local/direct testing (`connectivity.json`'s `destinationDiscovery: "static"`). |
| `BtpDestinationDiscoveryProvider` | **Phase 5.** Looks each tenant's destination up live in the **SAP BTP Destination service** (`destinationDiscovery: "btp"`, the recommended production setting). |
| `DestinationDefinition` | One resolvable destination: tenant id, destination name, base URL, `DeploymentEnvironment` (`development` \| `testing` \| `production` — the SDK's own vocabulary, distinct from the platform's `environment.json`), an `AuthProviderConfig`, and a `default` flag. |
| `TenantDestinationBinding` | **Phase 5.** The non-secret input to a discovery provider: tenant id, destination name, environment, fallback base URL. Carries no credentials at all — only the pointer to where they live. |

## Multi-tenant, multi-environment

Nothing in `DestinationResolver` assumes one tenant or one environment — supplying multiple
`DestinationDefinition`s covers both "multiple tenants" and "multiple destinations per tenant"
simultaneously. `listEnvironments()` reports the distinct environments across all known
destinations.

## `BtpDestinationDiscoveryProvider` (Phase 5)

Authenticates to the Destination service itself via OAuth 2.0 Client Credentials — reusing
`OAuthClientCredentialsProvider` rather than writing a second token-fetch implementation, since that
*is* exactly the Destination service's own security model. For each `TenantDestinationBinding` it
calls `GET {apiUrl}/destination-configuration/v1/destinations/{name}` and maps the response's
`Authentication` field into the matching `AuthProviderConfig`:

| Destination `Authentication` | Mapped to |
|---|---|
| `BasicAuthentication` | `{ type: "basic", basic: { username: User, password: Password } }` |
| `OAuth2ClientCredentials` | `{ type: "oauth-client-credentials", oauthClientCredentials: { tokenUrl: tokenServiceURL, clientId, clientSecret, scope } }` |
| anything else | throws `ConfigurationError` naming the unsupported type — fails fast rather than silently degrading to no auth |

A tenant's real CPI credentials are read **only** from the Destination service's response — never
from a configuration file or environment variable. The Destination service's *own* OAuth client
(used to authenticate the lookup call itself) is genuinely secret and comes from
`DESTINATION_SERVICE_*` environment variables (`config/env.ts`), never from `config/*.json`.

Swaps in for `StaticDestinationDiscoveryProvider` with no change to `DestinationResolver` or anything
above it — exactly the seam this "Future destination discovery" section originally described.
