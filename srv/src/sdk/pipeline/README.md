# `sdk/pipeline/` — request pipeline

The single orchestration point every provider/sub-client method is meant to run through once real
connectivity is wired (architecture: Request Pipeline, §7).

## What it does

`RequestPipeline.run(options)`:

1. **Before the transport call:** validates `input` (if a `validate` function and `input` are
   supplied), reads the optional cache (`CacheHooks`), then resolves the tenant's destination — base
   URL and live auth headers — via the injected `IDestinationResolver`.
2. **Calls** the caller-supplied `execute(tenant, context)` callback, which performs the actual
   REST/OData call(s) using the resolved `TenantContext` and assembled `OperationContext`.
3. **After the call:** logs the operation's total duration (category `sdk.pipeline` — distinct from
   the *per-HTTP-call* metrics `sdk/http`'s interceptors record, since one operation may issue
   several HTTP calls, e.g. a paginated fetch or an OData batch), guarantees every thrown value is a
   typed `AppError` (wrapping anything else as a `ServiceError`), and writes the optional cache.

## Why `execute` is a callback, not a fixed verb

Different operations need different transport shapes (a plain REST GET, an OData query with
`$batch`, a binary download) — the pipeline's job is only validation, destination resolution,
logging, and error/cache guarantees; it delegates the transport-specific part to the caller rather
than picking one HTTP method for every operation.

## Caching (`CacheHooks` / `MemoryCacheProvider`)

`CacheHooks<T>` is `{ key, read(key), write(key, value) }`. `MemoryCacheProvider` is the SDK's
default in-memory, TTL-based implementation — distinct from `core/memo/requestMemo` (Phase 1),
which de-duplicates only *in-flight* identical calls and discards state the instant they settle;
`MemoryCacheProvider` caches *completed* results for a fixed TTL so repeated calls within the window
skip the network entirely.

## Current status

Built and tested as infrastructure; the mock-backed sub-clients in `sdk/client/` do not currently
route through `RequestPipeline` (mock data has no destination/auth to resolve). It becomes load-
bearing the moment a real, CPI-backed provider replaces a mock one.
