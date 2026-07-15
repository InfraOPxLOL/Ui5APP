import type { RuntimeArtifactStatus } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

const NAMES = [
  "OrderToCash_SalesOrder_IN",
  "Invoice_SupplierInvoice_IN",
  "MaterialMaster_Replication_OUT",
  "CustomerMaster_Sync_OUT",
  "PurchaseOrder_Ack_IN",
  "ShipmentNotification_OUT",
];
const STATUSES = ["STARTED", "STARTED", "STARTED", "ERROR", "STOPPED"];

/**
 * Generates a deterministic list of realistic {@link RuntimeArtifactStatus} entries for the mock
 * engine's `RuntimeProvider` implementation.
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated artifact statuses.
 */
export function generateRuntimeArtifacts(count: number, seed = 42): RuntimeArtifactStatus[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const status = rng.pick(STATUSES);
    const name = NAMES[index % NAMES.length] ?? `IntegrationFlow_${index}`;
    return {
      artifactId: `artifact-${(seed * 1000 + index).toString(16)}`,
      name,
      type: "IntegrationFlow",
      version: `1.${rng.int(0, 9)}.${rng.int(0, 20)}`,
      status,
      deployedOn: new Date(now - rng.int(0, 30) * 86400000).toISOString(),
      deployedBy: rng.pick(["P123456", "P234567", "deployment.service"]),
      errorText: status === "ERROR" ? "Deployment failed: bundle activation error." : undefined,
    };
  });
}
