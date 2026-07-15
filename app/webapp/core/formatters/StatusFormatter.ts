import { ValueState } from "sap/ui/core/library";
import { MessageStatus, type MessageStatusValue } from "../constants/MessageStatus";
import { QueueStatus, type QueueStatusValue } from "../constants/QueueStatus";

/**
 * Centralized mapping of domain status values to UI5 semantic {@link sap.ui.core.ValueState} and
 * icons. Every status badge/indicator in the app resolves colour and icon here, so a status colour
 * is defined exactly once.
 */
export default class StatusFormatter {
  /**
   * Maps an MPL message status to a semantic value state.
   * @param status the message status value.
   * @returns the corresponding value state.
   */
  public static messageStatusState(status: MessageStatusValue | string): ValueState {
    switch (status) {
      case MessageStatus.Completed:
        return ValueState.Success;
      case MessageStatus.Failed:
      case MessageStatus.Abandoned:
        return ValueState.Error;
      case MessageStatus.Retry:
      case MessageStatus.Escalated:
        return ValueState.Warning;
      case MessageStatus.Processing:
        return ValueState.Information;
      default:
        return ValueState.None;
    }
  }

  /**
   * Maps an MPL message status to an SAP icon URI.
   * @param status the message status value.
   * @returns the icon URI.
   */
  public static messageStatusIcon(status: MessageStatusValue | string): string {
    switch (status) {
      case MessageStatus.Completed:
        return "sap-icon://sys-enter-2";
      case MessageStatus.Failed:
      case MessageStatus.Abandoned:
        return "sap-icon://error";
      case MessageStatus.Retry:
      case MessageStatus.Escalated:
        return "sap-icon://warning";
      case MessageStatus.Processing:
        return "sap-icon://process";
      default:
        return "sap-icon://question-mark";
    }
  }

  /**
   * Maps a JMS queue status to a semantic value state.
   * @param status the queue status value.
   * @returns the corresponding value state.
   */
  public static queueStatusState(status: QueueStatusValue | string): ValueState {
    switch (status) {
      case QueueStatus.Ok:
        return ValueState.Success;
      case QueueStatus.NearCapacity:
        return ValueState.Warning;
      case QueueStatus.Full:
      case QueueStatus.Blocked:
        return ValueState.Error;
      default:
        return ValueState.None;
    }
  }
}
