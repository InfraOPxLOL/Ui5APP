import type { IValueMappingProvider } from "../../core/providers/IValueMappingProvider.js";
import type { ValueMappingScheme } from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Value mapping sub-client (architecture: Integration Suite Client, §4 — `ValueMappingClient`).
 * Thin facade over {@link IValueMappingProvider} for the Value Mapping module.
 */
export class ValueMappingClient {
  public constructor(
    private readonly provider: IValueMappingProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Lists all value mapping schemes. See {@link IValueMappingProvider.listSchemes}. */
  public listSchemes(context?: ClientCallContext): Promise<readonly ValueMappingScheme[]> {
    return this.provider.listSchemes(resolveContext(this.defaultTenantId, context));
  }

  /** Reads a single scheme by name. See {@link IValueMappingProvider.getScheme}. */
  public getScheme(
    schemeName: string,
    context?: ClientCallContext,
  ): Promise<ValueMappingScheme | undefined> {
    return this.provider.getScheme(resolveContext(this.defaultTenantId, context), schemeName);
  }
}
