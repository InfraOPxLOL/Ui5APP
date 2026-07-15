import JSONModel from "sap/ui/model/json/JSONModel";
import type { DlqMessage, DlqRecovery, DlqReplayResult } from "../../service/coeDlq/CoeDlqTypes";

/** Shape of the DLQ & Intelligent Recovery Dashboard view model. */
export interface DlqState {
  busy: boolean;
  messages: DlqMessage[];
  total: number;
  selected: DlqRecovery | null;
  replayResult: DlqReplayResult | null;
}

/**
 * The single view model for the DLQ & Intelligent Recovery Dashboard workspace (architecture §15).
 *
 * @namespace com.middlewareops.integrationportal.model.coeDlq
 */
export default class DlqModel extends JSONModel {
  public constructor() {
    const initial: DlqState = {
      busy: false,
      messages: [],
      total: 0,
      selected: null,
      replayResult: null,
    };
    super(initial);
  }
}
