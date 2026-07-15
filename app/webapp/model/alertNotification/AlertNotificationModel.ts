import JSONModel from "sap/ui/model/json/JSONModel";
import type { AlertNotificationItem } from "../../service/alertNotification/AlertNotificationService";

/** Shape of the Alerts module view model. */
export interface AlertNotificationState {
  items: AlertNotificationItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Alerts module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.alertNotification
 */
export default class AlertNotificationModel extends JSONModel {
  public constructor() {
    const initial: AlertNotificationState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
