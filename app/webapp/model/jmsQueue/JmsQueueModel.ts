import JSONModel from "sap/ui/model/json/JSONModel";
import type { JmsQueueItem } from "../../service/jmsQueue/JmsQueueService";

/** Shape of the JMS Queues module view model. */
export interface JmsQueueState {
  items: JmsQueueItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the JMS Queues module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.jmsQueue
 */
export default class JmsQueueModel extends JSONModel {
  public constructor() {
    const initial: JmsQueueState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
