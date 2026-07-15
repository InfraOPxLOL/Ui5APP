import type { HealthStatus } from "../transform/index.js";

/**
 * The business-friendly view of one deployed runtime artifact (architecture: Phase 6, Runtime
 * Engine, §6; `version` added in Phase 12, Runtime Center, exactly per this doc comment's own prior
 * invitation — a purely additive extension to `RuntimeArtifactStatus`, not a redesign). `node`
 * remains a documented future field: SAP Integration Suite's runtime artifact API exposes it, but no
 * `core/providers` contract surfaces it yet.
 */
export interface RuntimeSummary {
  readonly artifactId: string;
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly health: HealthStatus;
  readonly deployedOn: string | undefined;
  readonly deployedBy: string | undefined;
  readonly errorText: string | undefined;
}
