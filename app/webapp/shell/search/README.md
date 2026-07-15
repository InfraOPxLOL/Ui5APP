# `shell/search/` — Global Search Framework (§14)

A shell-level search aggregator. Framework only — **no search provider ships in this phase** (no
Monitoring search yet); the shell shows an empty state until a module registers one.

## Contract

`SearchProvider.ts` defines:

- `SearchResultItem` — a generic hit (`id`, `title`, `description`, `icon`, `providerId`, optional
  `route`/`routeParameters`) so any future domain describes results uniformly.
- `SearchProvider` — `{ id, titleKey, icon, permission?, search(query, signal?) }`.
- `SearchResultGroup` — a provider's hits under its heading.

## Aggregator

`GlobalSearch` (`register` / `unregister` / `getProviders`):

- `search(query, engine, signal?)` fans out to every **authorized** provider in parallel
  (`Promise.allSettled`), skips providers whose permission is unsatisfied, logs and omits providers
  that reject (one bad source never breaks search), and returns non-empty groups.
- An empty/whitespace query returns no groups.

The Shell controller resolves each group's `titleKey` to text and binds the results to the
`SearchResults.fragment.xml` popover, cancelling superseded searches via an `AbortController`.

## Future provider

```ts
GlobalSearch.getInstance().register({
  id: "messages",
  titleKey: "search.group.messages",
  icon: "sap-icon://message-information",
  permission: { anyScope: ["Viewer"] },
  search: async (query, signal) => [ /* SearchResultItem[] */ ],
});
```
