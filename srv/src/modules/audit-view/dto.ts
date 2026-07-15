/**
 * Data transfer objects for the Audit Trail module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Audit Trail row. */
export interface AuditViewDto {
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly correlationId: string;
}
