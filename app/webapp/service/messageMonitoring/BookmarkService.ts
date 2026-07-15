/**
 * Session-only message bookmarking (§ Bookmarks). Mirrors the shell's `FavoritesService` pattern
 * (Phase 7): state lives in memory for the lifetime of the tab and is intentionally lost on reload —
 * persistence is a documented future, pluggable concern, not implemented here.
 */
export default class BookmarkService {
  private static instance: BookmarkService | undefined;
  private readonly bookmarked = new Set<string>();

  private constructor() {
    // Singleton — use BookmarkService.getInstance().
  }

  /** @returns the process-wide singleton bookmark service. */
  public static getInstance(): BookmarkService {
    BookmarkService.instance ??= new BookmarkService();
    return BookmarkService.instance;
  }

  /**
   * Toggles a message's bookmark state.
   * @param messageId the message id.
   * @returns whether the message is bookmarked *after* the toggle.
   */
  public toggle(messageId: string): boolean {
    if (this.bookmarked.has(messageId)) {
      this.bookmarked.delete(messageId);
      return false;
    }
    this.bookmarked.add(messageId);
    return true;
  }

  /** @param messageId the message id. @returns whether it is bookmarked. */
  public isBookmarked(messageId: string): boolean {
    return this.bookmarked.has(messageId);
  }

  /** @returns every bookmarked message id, insertion order. */
  public getAll(): readonly string[] {
    return [...this.bookmarked];
  }

  /** Clears every bookmark. */
  public clear(): void {
    this.bookmarked.clear();
  }
}
