import JSONModel from "sap/ui/model/json/JSONModel";
import type { MessageReplayItem } from "../../service/messageReplay/MessageReplayService";

/** Shape of the Message Replay module view model. */
export interface MessageReplayState {
  items: MessageReplayItem[];
  total: number;
  busy: boolean;
}

/**
 * The single view model for the Message Replay module (architecture §15). Owned by the module
 * component and exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.messageReplay
 */
export default class MessageReplayModel extends JSONModel {
  public constructor() {
    const initial: MessageReplayState = { items: [], total: 0, busy: false };
    super(initial);
  }
}
