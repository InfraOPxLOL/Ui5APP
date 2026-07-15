import JSONModel from "sap/ui/model/json/JSONModel";
import type { AnalyticsItem } from "../../service/analytics/AnalyticsService";

/** Shape of the Analytics module view model. */
export interface AnalyticsState {
  items: AnalyticsItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Analytics module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.analytics
 */
export default class AnalyticsModel extends JSONModel {
  public constructor() {
    const initial: AnalyticsState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
