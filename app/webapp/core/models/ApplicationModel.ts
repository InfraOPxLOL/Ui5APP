import JSONModel from "sap/ui/model/json/JSONModel";
import type { ApplicationInfo, EnvironmentConfig, ThemeConfig } from "../types/AppConfig";

/** Shape of the global application model. */
export interface ApplicationState {
  /** Technical identity (from `application.json`). */
  id: string;
  name: string;
  version: string;
  vendor: string;
  supportContact: string;
  documentationUrl: string;
  /** Branding (from `theme.json`). */
  title: string;
  companyName: string;
  logo: string;
  /** Environment (from `environment.json`). */
  environmentName: string;
  environmentLabel: string;
  environmentKind: string;
  /** Whether bootstrap has completed and the state above is real (not placeholder). */
  ready: boolean;
}

/**
 * Global application model: identity, branding and environment state for shell chrome and About
 * surfaces. Owned by the root component (model name `app`), populated from configuration during
 * bootstrap via {@link ApplicationModel.applyConfig}; placeholder values before that.
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class ApplicationModel extends JSONModel {
  public constructor() {
    const initial: ApplicationState = {
      id: "",
      name: "",
      version: "",
      vendor: "",
      supportContact: "",
      documentationUrl: "",
      title: "",
      companyName: "",
      logo: "",
      environmentName: "",
      environmentLabel: "",
      environmentKind: "",
      ready: false,
    };
    super(initial);
  }

  /**
   * Populates the model from loaded configuration.
   * @param application the application identity.
   * @param environment the environment descriptor.
   * @param theme the theme/branding configuration.
   */
  public applyConfig(
    application: ApplicationInfo,
    environment: EnvironmentConfig,
    theme: ThemeConfig,
  ): void {
    this.setData({
      id: application.id,
      name: application.name,
      version: application.version,
      vendor: application.vendor,
      supportContact: application.supportContact,
      documentationUrl: application.documentationUrl,
      title: theme.applicationTitle,
      companyName: theme.companyName,
      logo: theme.logo,
      environmentName: environment.name,
      environmentLabel: environment.label,
      environmentKind: environment.kind,
      ready: true,
    } satisfies ApplicationState);
  }
}
