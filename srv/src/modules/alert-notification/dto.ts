/**
 * Data transfer objects for the Alerts module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Alerts row. */
export interface AlertNotificationDto {
  readonly alertId: string;
  readonly severity: string;
  readonly title: string;
  readonly source: string;
  readonly raisedAt: string;
}
