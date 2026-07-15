import JSONModel from "sap/ui/model/json/JSONModel";
import type { AuditViewItem } from "../../service/auditView/AuditViewService";

/** Shape of the Audit Trail module view model. */
export interface AuditViewState {
  items: AuditViewItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Audit Trail module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.auditView
 */
export default class AuditViewModel extends JSONModel {
  public constructor() {
    const initial: AuditViewState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
