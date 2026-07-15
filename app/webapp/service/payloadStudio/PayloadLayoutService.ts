/** Payload Studio's resizable layout: navigation | editor | metadata, plus the bottom panel. */
export interface PayloadLayoutSnapshot {
  navCollapsed: boolean;
  metadataCollapsed: boolean;
  bottomPanelExpanded: boolean;
  bottomTab: string;
}

const DEFAULT_SNAPSHOT: PayloadLayoutSnapshot = {
  navCollapsed: false,
  metadataCollapsed: false,
  bottomPanelExpanded: true,
  bottomTab: "properties",
};

/**
 * Session-only panel-layout memory for Payload Studio (§ Layout — "remember layout during the
 * session"). A plain in-memory singleton, exactly like the shell's `FavoritesService` and Message
 * Investigation's `PanelLayoutService`/`BookmarkService`/`SavedSearchService`/`GridLayoutService` —
 * lost on reload, not persisted beyond the tab.
 */
export default class PayloadLayoutService {
  private static instance: PayloadLayoutService | undefined;
  private snapshot: PayloadLayoutSnapshot = { ...DEFAULT_SNAPSHOT };

  private constructor() {
    // Singleton — use PayloadLayoutService.getInstance().
  }

  /** @returns the process-wide singleton payload-layout service. */
  public static getInstance(): PayloadLayoutService {
    PayloadLayoutService.instance ??= new PayloadLayoutService();
    return PayloadLayoutService.instance;
  }

  /** @returns the current layout snapshot. */
  public getSnapshot(): PayloadLayoutSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Merges a partial update into the remembered layout.
   * @param update the fields to update.
   */
  public update(update: Partial<PayloadLayoutSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
  }
}
