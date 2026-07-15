# `operations/models/` — the Query Framework

`OperationsQuery` is the universal query object every engine method accepts (architecture: Phase 6,
Query Framework, §15) — business-friendly field names throughout, never an OData `$`-prefixed option
or a raw CPI field name.

## Fluent builder

```ts
const query = new OperationsQueryBuilder()
  .status("FAILED")
  .sender("SAP")
  .receiver("S4")
  .messageType("ORDERS")
  .customStatus("BusinessError")
  .applicationId("XYZ")
  .page(1)
  .pageSize(100)
  .sortBy("startTime")
  .desc()
  .build();
```

`OperationsQueryBuilder` is the only sanctioned way to build an `OperationsQuery` — the same
"fluent builder, never assemble the object by hand" discipline the SDK's `ODataQueryBuilder`
established. Every setter returns `this`; `.build()` merges the accumulated state over
`DEFAULT_OPERATIONS_QUERY` (1-based `page: 1`, `pageSize: 50`, `sortDirection: "desc"`, every
`include*` flag `false`).

## Which fields a given engine actually reads

Not every engine consumes every field (a `QueueEngine` search has no `sender`) — sharing one shape
means every engine method has the same signature, and a caller never needs to know which subset a
particular engine reads. See `engines/README.md` for which fields `MessageEngine`/`SearchEngine`
push down to the SDK server-side vs. apply in memory via `FilterEngine`.

## `toProviderPage`

Translates the query's 1-based `page`/`pageSize` into the SDK's 0-based `{skip, top}`
(`ProviderPage`) — the one conversion point between the business-friendly query and the SDK's own
paging vocabulary.
