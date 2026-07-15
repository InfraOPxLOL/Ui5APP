# `operations/cache/` — request-scoped caching

Architecture: Phase 6, Caching, §17 — "request-scoped in-memory caching only... Cache only duplicate
requests occurring during the same operation. No persistence. No long-term cache. No database."

`OperationsCache` is a thin, named wrapper around Phase 1's `core/memo/requestMemo.ts`'s
`RequestMemo` class — which already does exactly this: coalesce concurrent identical in-flight calls
into one shared promise and discard all state the instant it settles. Rather than write a second,
near-identical de-duplication class, the Operations Engine reuses that one directly.

## Why this is "request-scoped" in practice

`RequestMemo` itself has no built-in scoping — what makes an `OperationsCache` instance
*request-scoped* is that `OperationsEngine`'s constructor creates a **fresh** one every time (never a
process-wide singleton). Construct one `OperationsEngine` per inbound request/operation (exactly as
you would construct one `IntegrationSuiteSdkClient`) and its cache's lifetime naturally matches "this
operation" — consistent with the stateless-backend constraint carried through every phase so far.

## Not a data cache

Nothing written through `OperationsCache.dedupe()` outlives the promise it wraps. It exists purely to
protect the underlying SDK/tenant from thundering-herd duplicate calls within one operation (e.g. two
engines both needing the same certificate list) — never to serve stale data on a later, distinct
request.
