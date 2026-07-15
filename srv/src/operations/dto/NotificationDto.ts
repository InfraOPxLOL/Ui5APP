import type { Severity } from "../transform/index.js";

/**
 * The business-friendly view of one notification/alert (architecture: Phase 6, Notification Engine,
 * §12). Wraps `sdk.alertNotification`'s `AlertEvent` today; ready to fan in additional sources
 * (local threshold sweeps in a future phase) behind the same shape.
 */
export interface NotificationSummary {
  readonly notificationId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly raisedAt: string;
  readonly tags: readonly string[];
}
