/** The workspace's resizable layout: grid | context, plus the bottom drawer, plus the top Advanced Search panel's open state. */
export interface PanelLayoutSnapshot {
  /** Splitter size string for the right Context Panel. */
  contextPaneSize: string;
  /** Splitter size string for the bottom Detail Drawer. */
  drawerSize: string;
  /** Whether the top Advanced Search panel is open. */
  advancedSearchOpen: boolean;
  /** Whether the context panel is collapsed. */
  contextCollapsed: boolean;
  /** Whether the detail drawer is expanded. */
  drawerExpanded: boolean;
}

const DEFAULT_SNAPSHOT: PanelLayoutSnapshot = {
  contextPaneSize: "26%",
  drawerSize: "30%",
  advancedSearchOpen: false,
  contextCollapsed: false,
  drawerExpanded: false,
};

/**
 * Session-only panel-size memory for the investigation workspace's resizable layout (§ Workspace
 * Layout — "The layout should remember panel sizes during the session"). A plain in-memory
 * singleton, exactly like `FavoritesService`/`BookmarkService`/`SavedSearchService` — lost on reload,
 * not persisted beyond the tab.
 */
export default class PanelLayoutService {
  private static instance: PanelLayoutService | undefined;
  private snapshot: PanelLayoutSnapshot = { ...DEFAULT_SNAPSHOT };

  private constructor() {
    // Singleton — use PanelLayoutService.getInstance().
  }

  /** @returns the process-wide singleton panel-layout service. */
  public static getInstance(): PanelLayoutService {
    PanelLayoutService.instance ??= new PanelLayoutService();
    return PanelLayoutService.instance;
  }

  /** @returns the current layout snapshot. */
  public getSnapshot(): PanelLayoutSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Merges a partial update into the remembered layout.
   * @param update the fields to update.
   */
  public update(update: Partial<PanelLayoutSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
  }
}
