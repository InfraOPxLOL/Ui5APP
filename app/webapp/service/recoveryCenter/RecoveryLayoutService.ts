/** A Queue Explorer layout snapshot (§ Queue Explorer — "Saved layouts"). */
export interface ExplorerLayoutSnapshot {
  readonly search: string;
  readonly sortField: string;
  readonly sortDescending: boolean;
}

/** A named, saved Queue Explorer layout. */
export interface SavedExplorerLayout {
  readonly id: string;
  readonly name: string;
  readonly snapshot: ExplorerLayoutSnapshot;
}

/**
 * Session-only saved Queue Explorer layouts (§ Queue Explorer — "Saved layouts"). Mirrors
 * `messageMonitoring`'s `GridLayoutService`/`SavedSearchService`/the shell's `FavoritesService`:
 * in-memory for the tab's lifetime, "future persistence ready" — a later phase can back this with a
 * real store without changing callers.
 */
export default class RecoveryLayoutService {
  private static instance: RecoveryLayoutService | undefined;
  private readonly layouts = new Map<string, SavedExplorerLayout>();
  private sequence = 0;

  private constructor() {
    // Singleton — use RecoveryLayoutService.getInstance().
  }

  /** @returns the process-wide singleton layout service. */
  public static getInstance(): RecoveryLayoutService {
    RecoveryLayoutService.instance ??= new RecoveryLayoutService();
    return RecoveryLayoutService.instance;
  }

  /**
   * Saves a named layout.
   * @param name the display name.
   * @param snapshot the layout snapshot to save.
   * @returns the saved layout's id.
   */
  public save(name: string, snapshot: ExplorerLayoutSnapshot): string {
    const id = `explorer-layout-${(++this.sequence).toString()}`;
    this.layouts.set(id, { id, name, snapshot });
    return id;
  }

  /** @returns every saved layout. */
  public getAll(): readonly SavedExplorerLayout[] {
    return [...this.layouts.values()];
  }

  /**
   * @param id the saved layout's id.
   * @returns the saved layout, or `undefined` when unknown.
   */
  public get(id: string): SavedExplorerLayout | undefined {
    return this.layouts.get(id);
  }

  /**
   * Removes a saved layout.
   * @param id the saved layout's id.
   */
  public remove(id: string): void {
    this.layouts.delete(id);
  }
}
