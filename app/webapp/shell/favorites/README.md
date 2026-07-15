# `shell/favorites/` — Favorites & Recents (§15)

Manages the user's favorite workspaces/modules, pinned quick actions, and recently-visited
workspaces/modules. **Session only, no persistence** — persistence is a future, pluggable concern.

## `FavoritesService`

- **Toggles**: `toggleFavoriteWorkspace` / `toggleFavoriteModule` / `togglePinnedAction` (return the
  state after the toggle) and matching `isFavorite*` / `isPinnedAction` queries.
- **Recents**: `recordRecentWorkspace` / `recordRecentModule` maintain most-recently-used lists
  (newest first, de-duplicated, capped at six).
- **Snapshot**: `getSnapshot()` returns the whole `FavoritesSnapshot`.

Every mutation persists through the injected `FavoritesStore` and broadcasts
`context:favoritesChanged` so the landing page and pinned surfaces refresh reactively.

## Pluggable persistence

The default `InMemoryFavoritesStore` keeps state for the tab's lifetime and loses it on reload. A
later phase drops in a backend- or `localStorage`-backed `FavoritesStore` via
`FavoritesService.initialize(store)` — no consumer changes.

```ts
interface FavoritesStore {
  load(): FavoritesSnapshot;
  save(snapshot: FavoritesSnapshot): void;
}
```
