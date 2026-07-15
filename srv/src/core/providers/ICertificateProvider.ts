import type { CertificateInfo, ProviderContext } from "./types.js";

/**
 * Read access to keystore entries (certificates and key pairs) on an Integration Suite tenant.
 *
 * Backing the Certificate Management module, including the expiry sweep that powers proactive
 * expiry alerts. Read-only by design in this contract; mutating keystore operations are a
 * deliberately separate future contract with its own authorization scope.
 */
export interface ICertificateProvider {
  /**
   * Lists all keystore entries on the tenant.
   * @param context the tenant/correlation context.
   * @returns all keystore entries.
   */
  listCertificates(context: ProviderContext): Promise<readonly CertificateInfo[]>;

  /**
   * Lists keystore entries expiring within a horizon — the expiry-sweep query.
   * @param context the tenant/correlation context.
   * @param withinDays the look-ahead horizon in days.
   * @returns entries whose `validTo` falls within the horizon, soonest first.
   */
  listExpiring(context: ProviderContext, withinDays: number): Promise<readonly CertificateInfo[]>;
}
