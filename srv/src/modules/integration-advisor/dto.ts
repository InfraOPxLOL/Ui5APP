/**
 * Data transfer objects for the Integration Advisor module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single Integration Advisor row. */
export interface IntegrationAdvisorDto {
  readonly name: string;
  readonly artifactType: string;
  readonly status: string;
  readonly updatedAt: string;
}
