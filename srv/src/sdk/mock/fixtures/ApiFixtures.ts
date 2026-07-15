import type { ApiDto, ApiStatus } from "../../dto/ApiDto.js";
import { SeededRandom } from "../SeededRandom.js";

const APIS = [
  { apiName: "Sales Order API", proxyName: "sales-order-v1" },
  { apiName: "Invoice API", proxyName: "invoice-v2" },
  { apiName: "Material Master API", proxyName: "material-master-v1" },
  { apiName: "Shipment Tracking API", proxyName: "shipment-tracking-v1" },
];
const STATUSES: readonly ApiStatus[] = ["PUBLISHED", "PUBLISHED", "UNPUBLISHED", "DEPRECATED"];

/**
 * Generates a deterministic list of realistic {@link ApiDto} entries, for the `ApiManagementClient`
 * mock data (no dedicated provider contract exists for API Management; see the SDK client README).
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated API descriptors.
 */
export function generateApis(count: number, seed = 42): ApiDto[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const api = APIS[index % APIS.length] ?? {
      apiName: `API_${index}`,
      proxyName: `proxy-${index}`,
    };
    return {
      apiName: api.apiName,
      proxyName: api.proxyName,
      status: rng.pick(STATUSES),
      version: `v${rng.int(1, 3)}`,
      callsToday: rng.int(0, 25000),
      avgLatencyMs: rng.int(40, 1200),
    };
  });
}
