import JSONModel from "sap/ui/model/json/JSONModel";
import type { ThemeConfig } from "../types/AppConfig";

/** Shape of the theme model. */
export interface ThemeState {
  activeTheme: string;
  defaultTheme: string;
  darkTheme: string;
  availableThemes: readonly string[];
  allowUserOverride: boolean;
  compactMode: string;
  accentColor: string;
}

/**
 * Global theme model: the current theming state for binding (theme switcher, custom-styled
 * surfaces). Theme *application* is the ThemeService's job; this model only reflects state.
 * Owned by the root component (model name `theme`).
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class ThemeModel extends JSONModel {
  public constructor() {
    const initial: ThemeState = {
      activeTheme: "",
      defaultTheme: "",
      darkTheme: "",
      availableThemes: [],
      allowUserOverride: false,
      compactMode: "auto",
      accentColor: "",
    };
    super(initial);
  }

  /**
   * Populates the model from loaded configuration.
   * @param theme the theme configuration.
   * @param activeTheme the theme actually applied by the ThemeService.
   */
  public applyConfig(theme: ThemeConfig, activeTheme: string): void {
    this.setData({
      activeTheme,
      defaultTheme: theme.defaultTheme,
      darkTheme: theme.darkTheme,
      availableThemes: theme.availableThemes,
      allowUserOverride: theme.allowUserOverride,
      compactMode: theme.compactMode,
      accentColor: theme.accentColor,
    } satisfies ThemeState);
  }

  /**
   * Records a theme switch (called by the ThemeService after applying it).
   * @param themeId the now-active UI5 theme id.
   */
  public setActiveTheme(themeId: string): void {
    this.setProperty("/activeTheme", themeId);
  }
}
