/**
 * Data transfer objects for the API Monitoring module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single API Monitoring row. */
export interface ApiMonitoringDto {
  readonly apiName: string;
  readonly status: string;
  readonly callsToday: number;
  readonly avgLatencyMs: number;
}
