import JSONModel from "sap/ui/model/json/JSONModel";
import type { RoleViewItem } from "../../service/roleView/RoleViewService";

/** Shape of the Roles module view model. */
export interface RoleViewState {
  items: RoleViewItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Roles module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.roleView
 */
export default class RoleViewModel extends JSONModel {
  public constructor() {
    const initial: RoleViewState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
