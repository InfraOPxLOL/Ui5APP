/** One saved view: a name plus the screen state it restores. */
export interface SavedView<T> {
  readonly key: string;
  readonly name: string;
  readonly state: T;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The slice of the Web Storage API the store needs (so tests can pass a fake). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What one scope persists. */
interface StoredViews<T> {
  readonly version: 1;
  readonly views: readonly SavedView<T>[];
  readonly defaultKey: string | undefined;
}

/** Key of the built-in, unsaved "Standard" view. */
export const STANDARD_VIEW_KEY = "standard";

const STORAGE_PREFIX = "integrationPortal.views.";

/** An in-memory stand-in for when browser storage is unavailable (private mode, blocked site data). */
class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Shared fallback, so views saved during one session survive navigating between screens. */
const memoryFallback = new MemoryStorage();

/** @returns the browser's localStorage, or the in-memory fallback when it cannot be used. */
function defaultStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryFallback;
  }
}

/**
 * Named, user-saved views for one screen ("scope"), plus which one opens by default.
 *
 * Stored in the browser (`localStorage`), so views survive reloads and sessions on this browser.
 * The portal has no database yet; this class is the single seam a server-side store would replace,
 * and a view can always be carried elsewhere as a link (see the screens' "share" action). Every
 * storage access is guarded: corrupt or blocked storage degrades to an empty list, never an error.
 *
 * Framework-free, so it is unit tested directly.
 */
export default class SavedViewStore<T> {
  private readonly storageKey: string;

  public constructor(
    scope: string,
    private readonly storage: KeyValueStorage = defaultStorage(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.storageKey = `${STORAGE_PREFIX}${scope}`;
  }

  /** @returns every saved view, alphabetically. */
  public list(): SavedView<T>[] {
    return [...this.read().views].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @returns the view with this key, if saved. */
  public get(key: string): SavedView<T> | undefined {
    return this.read().views.find((view) => view.key === key);
  }

  /**
   * Saves a view. Saving under an existing key (or an existing name) overwrites it in place.
   * @param name the display name.
   * @param state the state to restore.
   * @param key an existing view to overwrite; omitted for a new view.
   * @returns the saved view.
   */
  public save(name: string, state: T, key?: string): SavedView<T> {
    const stored = this.read();
    const trimmed = name.trim();
    const existing =
      stored.views.find((view) => view.key === key) ??
      stored.views.find((view) => view.name.toLowerCase() === trimmed.toLowerCase());
    const now = this.clock().toISOString();
    const view: SavedView<T> = {
      key: existing?.key ?? `view-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      state,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.write({
      ...stored,
      views: [...stored.views.filter((candidate) => candidate.key !== view.key), view],
    });
    return view;
  }

  /** Renames a view; unknown keys are ignored. */
  public rename(key: string, name: string): void {
    const stored = this.read();
    this.write({
      ...stored,
      views: stored.views.map((view) =>
        view.key === key
          ? { ...view, name: name.trim(), updatedAt: this.clock().toISOString() }
          : view,
      ),
    });
  }

  /** Deletes a view; if it was the default, the standard view becomes the default again. */
  public remove(key: string): void {
    const stored = this.read();
    this.write({
      ...stored,
      views: stored.views.filter((view) => view.key !== key),
      defaultKey: stored.defaultKey === key ? undefined : stored.defaultKey,
    });
  }

  /**
   * Chooses the view that opens when the screen is opened.
   * @param key a saved view's key, or {@link STANDARD_VIEW_KEY} / `undefined` for the standard view.
   */
  public setDefault(key: string | undefined): void {
    const stored = this.read();
    const known = key !== undefined && stored.views.some((view) => view.key === key);
    this.write({ ...stored, defaultKey: known ? key : undefined });
  }

  /** @returns the key of the view that opens by default ({@link STANDARD_VIEW_KEY} when none). */
  public getDefaultKey(): string {
    return this.read().defaultKey ?? STANDARD_VIEW_KEY;
  }

  private read(): StoredViews<T> {
    try {
      const raw = this.storage.getItem(this.storageKey);
      const parsed = raw === null ? undefined : (JSON.parse(raw) as Partial<StoredViews<T>>);
      if (parsed?.version === 1 && Array.isArray(parsed.views)) {
        const views = parsed.views.filter(
          (view) => typeof view?.key === "string" && typeof view.name === "string",
        );
        const defaultKey = views.some((view) => view.key === parsed.defaultKey)
          ? parsed.defaultKey
          : undefined;
        return { version: 1, views, defaultKey };
      }
    } catch {
      // Corrupt or unreadable storage reads as "nothing saved".
    }
    return { version: 1, views: [], defaultKey: undefined };
  }

  private write(stored: StoredViews<T>): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(stored));
    } catch {
      // Storage full or blocked: the view stays in effect for this session only.
    }
  }
}
