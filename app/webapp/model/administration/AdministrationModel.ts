import JSONModel from "sap/ui/model/json/JSONModel";
import type { AdministrationItem } from "../../service/administration/AdministrationService";

/** Shape of the Administration module view model. */
export interface AdministrationState {
  items: AdministrationItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Administration module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.administration
 */
export default class AdministrationModel extends JSONModel {
  public constructor() {
    const initial: AdministrationState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
