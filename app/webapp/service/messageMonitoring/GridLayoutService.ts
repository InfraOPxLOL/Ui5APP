import type { InvestigationLayoutSnapshot } from "../../core/types/InvestigationTable";

/** A named, saved grid layout (§ Saved Layouts). */
export interface SavedLayout {
  readonly id: string;
  readonly name: string;
  readonly snapshot: InvestigationLayoutSnapshot;
}

/**
 * Session-only saved grid layouts (§ Message Table — "Saved layouts"). Mirrors
 * `SavedSearchService`/`BookmarkService`/the shell's `FavoritesService`: in-memory for the tab's
 * lifetime, "future persistence ready" — a later phase can back this with a real store without
 * changing callers.
 */
export default class GridLayoutService {
  private static instance: GridLayoutService | undefined;
  private readonly layouts = new Map<string, SavedLayout>();
  private sequence = 0;

  private constructor() {
    // Singleton — use GridLayoutService.getInstance().
  }

  /** @returns the process-wide singleton grid-layout service. */
  public static getInstance(): GridLayoutService {
    GridLayoutService.instance ??= new GridLayoutService();
    return GridLayoutService.instance;
  }

  /**
   * Saves a named layout.
   * @param name the display name.
   * @param snapshot the layout snapshot to save.
   * @returns the saved layout's id.
   */
  public save(name: string, snapshot: InvestigationLayoutSnapshot): string {
    const id = `layout-${(++this.sequence).toString()}`;
    this.layouts.set(id, { id, name, snapshot });
    return id;
  }

  /** @returns every saved layout. */
  public getAll(): readonly SavedLayout[] {
    return [...this.layouts.values()];
  }

  /**
   * @param id the saved layout's id.
   * @returns the saved layout, or `undefined` when unknown.
   */
  public get(id: string): SavedLayout | undefined {
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
