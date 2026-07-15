/** Lifecycle state of a design-time integration application/artifact. */
export type ApplicationStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED";

/**
 * A design-time integration application (an integration flow or other artifact within an
 * Integration Package), as exposed by Integration Suite's design-time/content API — distinct from
 * {@link RuntimeArtifactStatus} (`core/providers/types.js`), which describes the *deployed,
 * running* counterpart. Backs the future Integration Advisor / design-time browsing surfaces.
 */
export interface ApplicationDto {
  readonly applicationId: string;
  readonly name: string;
  readonly packageId: string;
  readonly version: string;
  readonly status: ApplicationStatus;
  readonly createdBy: string | undefined;
  readonly createdAt: string;
  readonly modifiedAt: string | undefined;
}
