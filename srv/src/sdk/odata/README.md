# `sdk/odata/` — OData framework

Reusable OData query building, response parsing, metadata extraction, and batching, versioned
across v2 and v4 (architecture: OData Framework, §5).

## Fluent query builder

```ts
new ODataQueryBuilder()
  .top(100)
  .skip(0)
  .filter(ODataFilter.and(
    ODataFilter.eq("status", "FAILED"),
    ODataFilter.contains("integrationFlow", "Order"),
  ))
  .orderBy("startTime", "desc")
  .select("messageId", "status", "startTime")
  .expand("errorDetails")
  .count()
  .build("v4"); // → { $top, $skip, $filter, $orderby, $select, $expand, $count }
```

`ODataFilter` is the only sanctioned way to build a `$filter` value — it guarantees correct literal
quoting/escaping and precedence parenthesization. `.build(version)` renders `$count`/`$inlinecount`
correctly per version and is the only place version matters for a query's shape; filter literal
encoding (date/time in particular) is also version-parametrized (see `ODataFilterExpression`).

## Response parsing

`ODataResponseParser.parse()` auto-detects a v2 envelope (`{d: {results, __count, __next}}`) vs a
v4 envelope (`{value, "@odata.count", "@odata.nextLink"}`) and normalizes both into one
`ODataResponse<T>` shape. `.toPagedResponse()` converts that into the platform-standard
`PagedResponse<T>` given the `$skip`/`$top` that were sent (OData doesn't echo these back).

## Metadata parsing

`ODataMetadataParser` extracts entity type/property declarations from a raw `$metadata` (EDMX) XML
document via targeted regex extraction — a focused tool for the subset of CSDL the SDK needs
(entity names + scalar properties), not a general-purpose XML/CSDL parser. Kept dependency-free
deliberately; a full CSDL parser is a documented option if a future provider needs associations,
complex types, or function imports.

## Batch requests

`ODataBatchBuilder` renders a `multipart/mixed` OData v2 `$batch` body from a sequence of
operations; `ODataBatchResponseParser` splits the corresponding response back into one
`BatchOperationResult` per operation, in submission order.

## `ODataClient` — the real OData client (Phase 5)

Ties the pieces above to an `IHttpClient` — the single seam a `Real*Provider` calls:

| Method | Purpose |
|---|---|
| `query(url, builder, tenant, context)` | One request, parsed into a normalized `ODataResponse`. |
| `queryPage(url, builder, tenant, context, page)` | `query()` + `toPagedResponse()` in one call. |
| `queryAllPages(url, builder, tenant, context)` | Follows `nextLink`/`__next` continuation automatically until exhausted (capped at 100 pages as a runaway-loop safety net). |
| `getEntity(url, tenant, context)` | Reads one entity by its key-qualified URL; `undefined` on 404. Correctly unwraps OData v2's `{ d: {...} }` single-entity envelope (v2 wraps single entities the same way it wraps collections in `d.results`; v4 does not wrap them). |
| `getMetadata(serviceUrl, tenant, context)` | Fetches raw `$metadata` XML — pair with `ODataMetadataParser`. |
| `batch(serviceUrl, builder, tenant, context)` | Posts a `$batch` request and parses the multipart response. |

Every non-2xx response is translated through `HttpErrorTranslator`; every malformed body — invalid
JSON, or JSON that matches neither the v2 nor v4 envelope shape — is translated into a typed
`ODataError` (`sdk/errors/ODataError.ts`) by `ODataResponseParser`, never a raw `SyntaxError`.
`ODataClient` adds no transport behaviour of its own (retry/timeout/compression already live in the
injected `IHttpClient`) — it only knows how to shape an OData request and parse an OData response.
