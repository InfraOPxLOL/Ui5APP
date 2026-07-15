import Theming from "sap/ui/core/Theming";
import type { ThemeConfig } from "../../types/AppConfig";
import ClientLogger, { type CategoryLogger } from "../../logging/ClientLogger";

/**
 * The theme application service — the only place that changes the active UI5 theme.
 *
 * Applies the configured default theme at bootstrap and executes user switches (when
 * `theme.json` → `allowUserOverride` permits, and only to themes in `availableThemes`). State
 * reflection for binding lives in the ThemeModel; this service owns the side effect.
 */
export default class ThemeService {
  private static instance: ThemeService | undefined;
  private readonly logger: CategoryLogger = ClientLogger.getLogger("theme");
  private config: ThemeConfig | undefined;

  private constructor() {
    // Singleton — use ThemeService.getInstance().
  }

  /**
   * @returns the process-wide singleton theme service.
   */
  public static getInstance(): ThemeService {
    ThemeService.instance ??= new ThemeService();
    return ThemeService.instance;
  }

  /**
   * Applies the configured default theme (bootstrap). No-ops when the bootstrap theme already
   * matches, so the initial render never flickers.
   * @param config the theme configuration.
   * @returns the now-active theme id.
   */
  public applyFromConfig(config: ThemeConfig): string {
    this.config = config;
    if (Theming.getTheme() !== config.defaultTheme) {
      Theming.setTheme(config.defaultTheme);
    }
    return Theming.getTheme();
  }

  /**
   * Switches to another theme, enforcing the configured policy.
   * @param themeId the UI5 theme id to apply.
   * @returns whether the switch was performed.
   */
  public setTheme(themeId: string): boolean {
    if (this.config === undefined || !this.config.allowUserOverride) {
      this.logger.warn("Theme switch rejected: user override is not allowed.");
      return false;
    }
    if (!this.config.availableThemes.includes(themeId)) {
      this.logger.warn(`Theme switch rejected: "${themeId}" is not an available theme.`);
      return false;
    }
    Theming.setTheme(themeId);
    return true;
  }

  /**
   * Toggles between the configured default (light) and dark themes.
   * @returns the now-active theme id.
   */
  public toggleDark(): string {
    if (this.config !== undefined) {
      const target =
        Theming.getTheme() === this.config.darkTheme
          ? this.config.defaultTheme
          : this.config.darkTheme;
      this.setTheme(target);
    }
    return Theming.getTheme();
  }

  /**
   * @returns the currently active UI5 theme id.
   */
  public getActiveTheme(): string {
    return Theming.getTheme();
  }
}
