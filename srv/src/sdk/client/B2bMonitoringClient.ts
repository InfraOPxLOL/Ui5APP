import type { IB2bMonitoringProvider } from "../../core/providers/IB2bMonitoringProvider.js";
import type {
  B2bInterchange,
  B2bInterchangeDetail,
  B2bInterchangeFilter,
  B2bPayloadContent,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/** B2B Monitor sub-client: a thin facade over {@link IB2bMonitoringProvider}. */
export class B2bMonitoringClient {
  public constructor(
    private readonly provider: IB2bMonitoringProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** See {@link IB2bMonitoringProvider.queryInterchanges}. */
  public queryInterchanges(
    filter: B2bInterchangeFilter,
    page: ProviderPage,
    context?: ClientCallContext,
  ): Promise<ProviderPagedResult<B2bInterchange>> {
    return this.provider.queryInterchanges(
      resolveContext(this.defaultTenantId, context),
      filter,
      page,
    );
  }

  /** See {@link IB2bMonitoringProvider.listStatuses}. */
  public listStatuses(
    filter: B2bInterchangeFilter,
    limit: number,
    context?: ClientCallContext,
  ): Promise<readonly string[]> {
    return this.provider.listStatuses(resolveContext(this.defaultTenantId, context), filter, limit);
  }

  /** See {@link IB2bMonitoringProvider.getInterchange}. */
  public getInterchange(
    id: string,
    context?: ClientCallContext,
  ): Promise<B2bInterchangeDetail | undefined> {
    return this.provider.getInterchange(resolveContext(this.defaultTenantId, context), id);
  }

  /** See {@link IB2bMonitoringProvider.getPayload}. */
  public getPayload(
    payloadEntityId: string,
    context?: ClientCallContext,
  ): Promise<B2bPayloadContent | undefined> {
    return this.provider.getPayload(resolveContext(this.defaultTenantId, context), payloadEntityId);
  }

  /** See {@link IB2bMonitoringProvider.findInterchangeByMplId}. */
  public findInterchangeByMplId(
    mplId: string,
    context?: ClientCallContext,
  ): Promise<B2bInterchange | undefined> {
    return this.provider.findInterchangeByMplId(
      resolveContext(this.defaultTenantId, context),
      mplId,
    );
  }
}
