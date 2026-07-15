import JSONModel from "sap/ui/model/json/JSONModel";
import type { CoeGlobalSettings } from "../../service/coeAdmin/CoeAdminTypes";

/** The editable draft of the four global settings (all fields always present for a valid PUT). */
export interface CoeSettingsDraft {
  environment: string;
  defaultRetries: number;
  defaultExceptionTo: string;
  defaultEgressUri: string;
}

/** Per-field UI5 value states for inline validation feedback. */
export interface CoeValueStates {
  defaultExceptionTo: string;
  defaultEgressUri: string;
}

/** Shape of the CoE Admin view model. */
export interface AdminSettingsState {
  loaded: boolean;
  busy: boolean;
  editing: boolean;
  settings: CoeGlobalSettings;
  draft: CoeSettingsDraft;
  valueState: CoeValueStates;
  environments: string[];
}

/** Sensible defaults used to seed the editable draft when a parameter is not yet set on the tenant. */
export const DRAFT_DEFAULTS: CoeSettingsDraft = {
  environment: "DEV",
  defaultRetries: 5,
  defaultExceptionTo: "",
  defaultEgressUri: "/",
};

/**
 * The single view model for the CoE Admin workspace (architecture §15). Owned by the controller and
 * exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.coeAdmin
 */
export default class AdminSettingsModel extends JSONModel {
  public constructor() {
    const initial: AdminSettingsState = {
      loaded: false,
      busy: false,
      editing: false,
      settings: {
        environment: undefined,
        defaultRetries: undefined,
        defaultExceptionTo: undefined,
        defaultEgressUri: undefined,
        lastModifiedBy: undefined,
        lastModifiedAt: undefined,
      },
      draft: { ...DRAFT_DEFAULTS },
      valueState: { defaultExceptionTo: "None", defaultEgressUri: "None" },
      environments: ["PRD", "QAS", "DEV"],
    };
    super(initial);
  }
}
