import type { ProviderContext, ValueMappingScheme } from "./types.js";

/**
 * Read access to value mapping schemes on an Integration Suite tenant.
 *
 * Backing the Value Mapping module. Added in Phase 4 alongside the SDK, completing the provider
 * framework alongside the six contracts introduced in Phase 3 — same shape, same rules (context,
 * error boundary, statelessness; see `core/providers/README.md`).
 */
export interface IValueMappingProvider {
  /**
   * Lists all value mapping schemes on the tenant.
   * @param context the tenant/correlation context.
   * @returns all value mapping schemes.
   */
  listSchemes(context: ProviderContext): Promise<readonly ValueMappingScheme[]>;

  /**
   * Reads a single value mapping scheme by name.
   * @param context the tenant/correlation context.
   * @param schemeName the scheme name.
   * @returns the scheme, or `undefined` when unknown.
   */
  getScheme(context: ProviderContext, schemeName: string): Promise<ValueMappingScheme | undefined>;
}
