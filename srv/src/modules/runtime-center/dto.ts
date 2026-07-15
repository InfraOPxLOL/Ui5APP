import type {
  CatalogEntry,
  IntegrationDetails,
  RuntimeHealthSummary,
  DeploymentEvent,
} from "../../operations/dto/index.js";

/**
 * Data transfer objects for the Runtime Center (Phase 12) — the HTTP contract behind
 * `/api/v1/runtime-center`. Every response shape is the Operations Engine's own Runtime Center DTO,
 * re-exported verbatim (no SDK/CPI/OData shape ever appears here).
 */
export type { CatalogEntry, IntegrationDetails, RuntimeHealthSummary, DeploymentEvent };
