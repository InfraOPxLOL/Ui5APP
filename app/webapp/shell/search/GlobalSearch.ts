import ClientLogger, { type CategoryLogger } from "../../core/logging/ClientLogger";
import type { SearchProvider, SearchResultGroup } from "./SearchProvider";
import type PermissionEngine from "../permissions/PermissionEngine";

/**
 * The shell's global-search aggregator (§14). Framework only.
 *
 * Modules register a {@link SearchProvider}; a search fans out to every provider the current user
 * is authorized for, in parallel, and the results come back grouped by provider. A provider that
 * rejects or throws is logged and skipped so one bad source never breaks search. No provider ships
 * in this phase — the shell renders "no results" until a module registers one.
 */
export default class GlobalSearch {
  private static instance: GlobalSearch | undefined;
  private readonly providers = new Map<string, SearchProvider>();
  private readonly logger: CategoryLogger = ClientLogger.getLogger("shell.search");

  private constructor() {
    // Singleton — use GlobalSearch.getInstance().
  }

  /**
   * @returns the process-wide singleton global-search aggregator.
   */
  public static getInstance(): GlobalSearch {
    GlobalSearch.instance ??= new GlobalSearch();
    return GlobalSearch.instance;
  }

  /**
   * Registers (or replaces by id) a search provider.
   * @param provider the provider to register.
   */
  public register(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Removes a search provider.
   * @param providerId the provider id to remove.
   */
  public unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * @returns all registered providers.
   */
  public getProviders(): readonly SearchProvider[] {
    return [...this.providers.values()];
  }

  /**
   * @param engine the current user's permission engine.
   * @returns the providers the user is authorized to search.
   */
  public getAuthorizedProviders(engine: PermissionEngine): readonly SearchProvider[] {
    return this.getProviders().filter((provider) => engine.isSatisfied(provider.permission));
  }

  /**
   * Runs a query across every authorized provider in parallel and groups the results. An empty or
   * whitespace-only query returns no groups. Providers that fail are logged and omitted.
   * @param query the raw query string.
   * @param engine the current user's permission engine.
   * @param signal optional abort signal forwarded to providers.
   * @returns the non-empty result groups, in provider-registration order.
   */
  public async search(
    query: string,
    engine: PermissionEngine,
    signal?: AbortSignal,
  ): Promise<readonly SearchResultGroup[]> {
    const trimmed = query.trim();
    if (trimmed === "") {
      return [];
    }
    const providers = this.getAuthorizedProviders(engine);
    const settled = await Promise.allSettled(
      providers.map((provider) => provider.search(trimmed, signal)),
    );
    const groups: SearchResultGroup[] = [];
    settled.forEach((result, index) => {
      const provider = providers[index];
      if (provider === undefined) {
        return;
      }
      if (result.status === "rejected") {
        this.logger.warn(`Search provider "${provider.id}" failed`, {
          reason: String(result.reason),
        });
        return;
      }
      if (result.value.length > 0) {
        groups.push({
          providerId: provider.id,
          titleKey: provider.titleKey,
          icon: provider.icon,
          items: result.value,
        });
      }
    });
    return groups;
  }
}
