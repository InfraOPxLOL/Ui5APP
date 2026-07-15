/**
 * Data transfer objects for the Roles module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Roles row. */
export interface RoleViewDto {
  readonly roleName: string;
  readonly description: string;
  readonly scopeCount: number;
}
