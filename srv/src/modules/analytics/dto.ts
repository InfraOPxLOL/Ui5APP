/**
 * Data transfer objects for the Analytics module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Analytics row. */
export interface AnalyticsDto {
  readonly metric: string;
  readonly value: number;
  readonly period: string;
}
