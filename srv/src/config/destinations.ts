import { configService } from "./ConfigService.js";

/**
 * A resolved destination: the base URL and the headers (including auth) to use when calling it.
 */
export interface ResolvedDestination {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Resolves the connection details for a tenant's Integration Suite destination.
 *
 * In a deployed BTP environment the OAuth/Basic credential is resolved from the bound **Destination
 * service** by the destination name configured for the tenant (`tenants.json` →
 * `destinationName`) — never from configuration files (architecture §11, §14). The current
 * placeholder returns the tenant base URL with no injected auth header; the Destination-service
 * lookup that produces the `Authorization` header is the single documented injection point here
 * ({@link resolveDestination}), and nothing above this function changes when it is wired.
 *
 * @param tenantId optional tenant id; the default tenant is used when omitted.
 * @returns the resolved destination connection details.
 */
export async function resolveDestination(tenantId?: string): Promise<ResolvedDestination> {
  const tenant = configService.getTenant(tenantId);
  // Placeholder: base URL from tenants.json; auth header injected from the Destination service in
  // a later phase (keyed by tenant.destinationName). Promise-shaped so wiring it is non-breaking.
  return Promise.resolve({
    url: tenant.baseUrl,
    headers: {},
  });
}
