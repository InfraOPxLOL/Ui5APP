import type { MessageSearchCriteria } from "./MessageInvestigationTypes";

/** A saved search: a name plus the full advanced-search criteria at the time it was saved. */
export interface SavedSearch {
  readonly id: string;
  readonly name: string;
  readonly criteria: MessageSearchCriteria;
  readonly createdAt: string;
}

/**
 * Session-only saved searches (§ Advanced Search — "Saved Searches"). Mirrors the shell's
 * `FavoritesService` pattern (Phase 7): in-memory for the tab's lifetime, "future persistence ready"
 * per the phase spec — a later phase can back this with a real store without changing callers.
 */
export default class SavedSearchService {
  private static instance: SavedSearchService | undefined;
  private readonly searches = new Map<string, SavedSearch>();
  private sequence = 0;

  private constructor() {
    // Singleton — use SavedSearchService.getInstance().
  }

  /** @returns the process-wide singleton saved-search service. */
  public static getInstance(): SavedSearchService {
    SavedSearchService.instance ??= new SavedSearchService();
    return SavedSearchService.instance;
  }

  /**
   * Saves a named search.
   * @param name the display name.
   * @param criteria the criteria to save.
   * @returns the saved search's id.
   */
  public save(name: string, criteria: MessageSearchCriteria): string {
    const id = `search-${(++this.sequence).toString()}`;
    this.searches.set(id, {
      id,
      name,
      criteria: { ...criteria },
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  /**
   * Removes a saved search.
   * @param id the saved search's id.
   */
  public remove(id: string): void {
    this.searches.delete(id);
  }

  /** @returns every saved search, most recently saved first. */
  public getAll(): readonly SavedSearch[] {
    return [...this.searches.values()].reverse();
  }

  /**
   * @param id the saved search's id.
   * @returns the saved search, or `undefined` when unknown.
   */
  public get(id: string): SavedSearch | undefined {
    return this.searches.get(id);
  }
}
