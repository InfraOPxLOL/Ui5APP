# `sdk/auth/` — authentication framework

Selects and constructs an `IAuthProvider` from configuration (architecture: Authentication
Framework, §2). Credentials are never hardcoded; they arrive via dependency injection (resolved, in
the real deployment, from the BTP Destination service).

## The contract

`IAuthProvider.getAuthHeaders(context: AuthContext): Promise<Record<string, string>>` — every
mechanism boils down to "produce the headers for one call." The request pipeline's destination
resolution calls this once per tenant/call and merges the result into the outbound request.

## Implementations

| Type | Class | Status |
|---|---|---|
| `basic` | `BasicAuthProvider` | Implemented — HTTP Basic, base64-encoded. |
| `oauth-client-credentials` | `OAuthClientCredentialsProvider` | Implemented — OAuth 2.0 Client Credentials grant, token cached via `TokenCache` and refreshed automatically near expiry. Fetches its token through an injected `IHttpClient`, never `fetch` directly. |
| `principal-propagation` | `PrincipalPropagationAuthProvider` | Documented future extension point — throws a clear `ServiceError` (a rejected Promise, not a synchronous throw) when invoked. |
| `x509` | `X509AuthProvider` | Same as above. |
| `saml` | `SamlAuthProvider` | Same as above. |

## `AuthProviderFactory`

```ts
const provider = AuthProviderFactory.create(
  { type: "basic", basic: { username, password } },
  httpClient,
);
```

Throws `ConfigurationError` if the selected type's required config is missing (e.g. `basic` without
`config.basic`). This is the only place an `AuthType` is switched on — callers never branch on it
themselves.

## `TokenCache`

In-memory, per-process, with an expiry-skew margin (default 30s) so a token that's about to expire
is treated as already expired — avoiding starting a request with a token that dies mid-flight.
Distinct from `core/memo/requestMemo` (in-flight de-duplication) and from
`sdk/pipeline/MemoryCacheProvider` (result caching with a fixed TTL): this specifically caches
credential tokens against their own expiry.

## Why future providers return rejected Promises, not synchronous throws

`getAuthHeaders` is typed `Promise<...>`. A method that `throw`s synchronously instead of returning
`Promise.reject(...)` breaks any caller using `.catch(...)` chaining (the throw happens before a
Promise is even returned) even though `await` inside `try`/`catch` happens to still work. All three
future providers use `Promise.reject` for exactly this reason — caught by
`srv/test/unit/sdk/auth.test.ts`.
