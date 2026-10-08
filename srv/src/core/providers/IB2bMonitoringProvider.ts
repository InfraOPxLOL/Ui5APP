import type {
  B2bInterchange,
  B2bInterchangeDetail,
  B2bInterchangeFilter,
  B2bPayloadContent,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "./types.js";

/**
 * Read access to Trading Partner Management's B2B Monitor (`BusinessDocuments` and its navigations
 * on the Cloud Integration OData API). Fetched live per request; nothing is persisted.
 */
export interface IB2bMonitoringProvider {
  /**
   * Lists interchanges newest first, filtered server-side.
   * @param context the tenant/correlation context.
   * @param filter the server-side filter.
   * @param page the requested window.
   * @returns the page plus the total matching count.
   */
  queryInterchanges(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<B2bInterchange>>;

  /**
   * Reads the `OverallStatus` of interchanges in a window, for status counts. Bounded by `limit`.
   * @param context the tenant/correlation context.
   * @param filter the server-side filter.
   * @param limit the maximum number of rows to read.
   * @returns one status per interchange read.
   */
  listStatuses(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    limit: number,
  ): Promise<readonly string[]>;

  /**
   * Reads one interchange with its events, payload metadata and errors.
   * @param context the tenant/correlation context.
   * @param id the `BusinessDocument` id.
   * @returns the detail, or `undefined` when unknown.
   */
  getInterchange(context: ProviderContext, id: string): Promise<B2bInterchangeDetail | undefined>;

  /**
   * Reads one stored payload including its content.
   * @param context the tenant/correlation context.
   * @param payloadEntityId the `BusinessDocumentPayload` key.
   * @returns the payload, or `undefined` when unknown.
   */
  getPayload(
    context: ProviderContext,
    payloadEntityId: string,
  ): Promise<B2bPayloadContent | undefined>;

  /**
   * Finds the interchange a message processing log belongs to, via the processing event whose
   * `MonitoringId` is that MPL.
   * @param context the tenant/correlation context.
   * @param mplId the MPL message id.
   * @returns the interchange, or `undefined` when the MPL is not linked to one.
   */
  findInterchangeByMplId(
    context: ProviderContext,
    mplId: string,
  ): Promise<B2bInterchange | undefined>;
}
