import JSONModel from "sap/ui/model/json/JSONModel";
import type { BrandingInfo, EnvironmentBanner, TenantBanner } from "../../branding/BrandingService";
import type {
  AnnouncementVM,
  ModuleCardVM,
  QuickActionVM,
  WorkspaceCardVM,
} from "../../model/ShellViewTypes";

/** The landing page's health indicator (§2). Framework placeholder until modules feed live health. */
export interface HomeHealth {
  readonly state: string;
  readonly text: string;
}

/** Active theme information surfaced on the landing page (§2). */
export interface HomeThemeInfo {
  readonly activeTheme: string;
  readonly accentColor: string;
}

/** The complete, bindable state of the landing page (§2). */
export interface HomeState {
  loaded: boolean;
  welcome: string;
  subtitle: string;
  displayName: string;
  userId: string;
  email: string;
  language: string;
  version: string;
  roleCollections: readonly string[];
  tenant: TenantBanner;
  environment: EnvironmentBanner;
  branding: BrandingInfo;
  theme: HomeThemeInfo;
  health: HomeHealth;
  favoriteWorkspaces: readonly WorkspaceCardVM[];
  recentWorkspaces: readonly WorkspaceCardVM[];
  availableWorkspaces: readonly WorkspaceCardVM[];
  recentModules: readonly ModuleCardVM[];
  quickActions: readonly QuickActionVM[];
  announcements: readonly AnnouncementVM[];
}

const EMPTY_BRANDING: BrandingInfo = {
  applicationName: "",
  applicationTitle: "",
  version: "",
  vendor: "",
  companyName: "",
  applicationLogo: "",
  companyLogo: "",
  accentColor: "",
  supportContact: "",
  documentationUrl: "",
};

/**
 * View model backing the landing (home) page (model name `home`). It only reflects state; the
 * {@link module:shell/landing/controller/Home} controller rebuilds it from the framework services
 * on show and whenever the user context, tenant or favorites change.
 *
 * @namespace com.middlewareops.integrationportal.shell.landing.model
 */
export default class HomeModel extends JSONModel {
  public constructor() {
    const initial: HomeState = {
      loaded: false,
      welcome: "",
      subtitle: "",
      displayName: "",
      userId: "",
      email: "",
      language: "",
      version: "",
      roleCollections: [],
      tenant: { name: "", color: "", icon: "", show: false },
      environment: { label: "", kind: "", show: false },
      branding: EMPTY_BRANDING,
      theme: { activeTheme: "", accentColor: "" },
      health: { state: "None", text: "" },
      favoriteWorkspaces: [],
      recentWorkspaces: [],
      availableWorkspaces: [],
      recentModules: [],
      quickActions: [],
      announcements: [],
    };
    super(initial);
  }

  /**
   * Replaces the whole landing state.
   * @param state the newly-built state.
   */
  public apply(state: HomeState): void {
    this.setData(state);
  }
}
