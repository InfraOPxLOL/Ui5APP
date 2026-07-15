import AppEventBus from "../../core/events/AppEventBus";
import type { ModuleId } from "../../core/types/Module";
import type { WorkspaceId } from "../registry/WorkspaceTypes";

/**
 * The persistable shape of a user's favorites and recents (§15). Plain data so any store — the
 * in-memory default, or a future backend/localStorage store — can round-trip it.
 */
export interface FavoritesSnapshot {
  readonly favoriteWorkspaces: readonly WorkspaceId[];
  readonly favoriteModules: readonly ModuleId[];
  readonly pinnedActions: readonly string[];
  readonly recentWorkspaces: readonly WorkspaceId[];
  readonly recentModules: readonly ModuleId[];
}

/**
 * Pluggable persistence for favorites (§15). The default is session-only in memory; a later phase
 * can drop in a backend- or `localStorage`-backed store without touching {@link FavoritesService}.
 */
export interface FavoritesStore {
  load(): FavoritesSnapshot;
  save(snapshot: FavoritesSnapshot): void;
}

const EMPTY_SNAPSHOT: FavoritesSnapshot = {
  favoriteWorkspaces: [],
  favoriteModules: [],
  pinnedActions: [],
  recentWorkspaces: [],
  recentModules: [],
};

/**
 * The default, session-only favorites store. State lives in memory for the lifetime of the tab and
 * is intentionally lost on reload — persistence is a future, pluggable concern (§15).
 */
export class InMemoryFavoritesStore implements FavoritesStore {
  private snapshot: FavoritesSnapshot = EMPTY_SNAPSHOT;

  public load(): FavoritesSnapshot {
    return this.snapshot;
  }

  public save(snapshot: FavoritesSnapshot): void {
    this.snapshot = snapshot;
  }
}

/** Most-recently-used lists are capped so a long session cannot grow unbounded. */
const MAX_RECENTS = 6;

/**
 * Manages the user's favorite workspaces/modules, pinned quick actions and recently-visited
 * workspaces/modules (§15).
 *
 * Favorites are toggles; recents are most-recently-used lists (newest first, de-duplicated, capped).
 * All mutations persist through the injected {@link FavoritesStore} and announce
 * `context:favoritesChanged` so the landing page and any pinned surfaces refresh reactively —
 * without this service knowing who is listening.
 */
export default class FavoritesService {
  private static instance: FavoritesService | undefined;

  private constructor(private readonly store: FavoritesStore = new InMemoryFavoritesStore()) {}

  /**
   * @returns the process-wide singleton favorites service.
   */
  public static getInstance(): FavoritesService {
    FavoritesService.instance ??= new FavoritesService();
    return FavoritesService.instance;
  }

  /**
   * Replaces the singleton with one backed by a specific store. Used at bootstrap to install a
   * persistent store, and by tests for isolation.
   * @param store the store to back the service with.
   * @returns the (re)created singleton.
   */
  public static initialize(store: FavoritesStore): FavoritesService {
    FavoritesService.instance = new FavoritesService(store);
    return FavoritesService.instance;
  }

  /** @returns the current snapshot of favorites and recents. */
  public getSnapshot(): FavoritesSnapshot {
    return this.store.load();
  }

  /**
   * Toggles a workspace as favorite.
   * @param id the workspace id.
   * @returns whether the workspace is a favorite *after* the toggle.
   */
  public toggleFavoriteWorkspace(id: WorkspaceId): boolean {
    const next = FavoritesService.toggle(this.getSnapshot().favoriteWorkspaces, id);
    this.commit({ ...this.getSnapshot(), favoriteWorkspaces: next });
    return next.includes(id);
  }

  /**
   * Toggles a module as favorite.
   * @param id the module id.
   * @returns whether the module is a favorite *after* the toggle.
   */
  public toggleFavoriteModule(id: ModuleId): boolean {
    const next = FavoritesService.toggle(this.getSnapshot().favoriteModules, id);
    this.commit({ ...this.getSnapshot(), favoriteModules: next });
    return next.includes(id);
  }

  /**
   * Toggles a quick action as pinned.
   * @param actionId the quick-action id.
   * @returns whether the action is pinned *after* the toggle.
   */
  public togglePinnedAction(actionId: string): boolean {
    const next = FavoritesService.toggle(this.getSnapshot().pinnedActions, actionId);
    this.commit({ ...this.getSnapshot(), pinnedActions: next });
    return next.includes(actionId);
  }

  /** @param id workspace id. @returns whether it is a favorite. */
  public isFavoriteWorkspace(id: WorkspaceId): boolean {
    return this.getSnapshot().favoriteWorkspaces.includes(id);
  }

  /** @param id module id. @returns whether it is a favorite. */
  public isFavoriteModule(id: ModuleId): boolean {
    return this.getSnapshot().favoriteModules.includes(id);
  }

  /** @param actionId quick-action id. @returns whether it is pinned. */
  public isPinnedAction(actionId: string): boolean {
    return this.getSnapshot().pinnedActions.includes(actionId);
  }

  /**
   * Records a workspace visit at the head of the recent-workspaces list.
   * @param id the visited workspace id.
   */
  public recordRecentWorkspace(id: WorkspaceId): void {
    const next = FavoritesService.pushRecent(this.getSnapshot().recentWorkspaces, id);
    this.commit({ ...this.getSnapshot(), recentWorkspaces: next });
  }

  /**
   * Records a module visit at the head of the recent-modules list.
   * @param id the visited module id.
   */
  public recordRecentModule(id: ModuleId): void {
    const next = FavoritesService.pushRecent(this.getSnapshot().recentModules, id);
    this.commit({ ...this.getSnapshot(), recentModules: next });
  }

  private commit(snapshot: FavoritesSnapshot): void {
    this.store.save(snapshot);
    AppEventBus.getInstance().publish("context:favoritesChanged", {});
  }

  private static toggle<T>(list: readonly T[], value: T): readonly T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  private static pushRecent<T>(list: readonly T[], value: T): readonly T[] {
    return [value, ...list.filter((item) => item !== value)].slice(0, MAX_RECENTS);
  }
}
