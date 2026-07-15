/**
 * Message Processing Log (MPL) status values as reported by SAP Cloud Integration.
 * Centralized so status handling and colour mapping is consistent across every module that renders
 * message state (Message Monitoring, Live Monitoring, Message Replay).
 */
export const MessageStatus = {
  Completed: "COMPLETED",
  Failed: "FAILED",
  Processing: "PROCESSING",
  Retry: "RETRY",
  Escalated: "ESCALATED",
  Abandoned: "ABANDONED",
  Discarded: "DISCARDED",
  Cancelled: "CANCELLED",
} as const;

/** Union of all MPL status values. */
export type MessageStatusValue = (typeof MessageStatus)[keyof typeof MessageStatus];
