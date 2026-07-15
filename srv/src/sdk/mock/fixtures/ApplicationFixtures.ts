import type { ApplicationDto, ApplicationStatus } from "../../dto/ApplicationDto.js";
import { SeededRandom } from "../SeededRandom.js";

const APPLICATIONS = [
  { name: "OrderToCash_SalesOrder_IN", packageId: "com.acme.ordertocash" },
  { name: "Invoice_SupplierInvoice_IN", packageId: "com.acme.procurement" },
  { name: "MaterialMaster_Replication_OUT", packageId: "com.acme.masterdata" },
  { name: "CustomerMaster_Sync_OUT", packageId: "com.acme.masterdata" },
];
const STATUSES: readonly ApplicationStatus[] = ["PUBLISHED", "PUBLISHED", "DRAFT", "DEPRECATED"];

/**
 * Generates a deterministic list of realistic {@link ApplicationDto} entries, for the
 * `DesignTimeClient` mock data (no dedicated provider contract exists for design-time browsing; see
 * the SDK client README).
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated application descriptors.
 */
export function generateApplications(count: number, seed = 42): ApplicationDto[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const app = APPLICATIONS[index % APPLICATIONS.length] ?? {
      name: `Application_${index}`,
      packageId: "com.acme.generated",
    };
    const createdAt = new Date(now - rng.int(30, 500) * 86400000).toISOString();
    return {
      applicationId: `app-${(seed * 1000 + index).toString(16)}`,
      name: app.name,
      packageId: app.packageId,
      version: `1.${rng.int(0, 9)}.${rng.int(0, 9)}`,
      status: rng.pick(STATUSES),
      createdBy: rng.pick(["P123456", "P234567", undefined]),
      createdAt,
      modifiedAt: rng.chance(0.6)
        ? new Date(now - rng.int(0, 29) * 86400000).toISOString()
        : undefined,
    };
  });
}
