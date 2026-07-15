import JSONModel from "sap/ui/model/json/JSONModel";
import type { AppConfig } from "../types/AppConfig";

/** Shape of the configuration model. */
export interface ConfigurationState {
  loaded: boolean;
  config: AppConfig | null;
}

/**
 * Global configuration model: a read-only binding surface over the loaded runtime configuration,
 * for Administration/diagnostics views that *display* configuration. Code must keep reading
 * configuration through the ConfigService — this model exists purely for declarative binding.
 * Owned by the root component (model name `configState`).
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class ConfigurationModel extends JSONModel {
  public constructor() {
    const initial: ConfigurationState = { loaded: false, config: null };
    super(initial);
    this.setDefaultBindingMode("OneWay");
  }

  /**
   * Publishes the loaded configuration snapshot.
   * @param config the loaded runtime configuration.
   */
  public applyConfig(config: AppConfig): void {
    this.setData({ loaded: true, config } satisfies ConfigurationState);
  }
}
