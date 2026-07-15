import type { IPartnerDirectoryProvider } from "../../core/providers/IPartnerDirectoryProvider.js";
import type {
  PartnerDirectoryBinaryParameter,
  PartnerDirectoryStringParameter,
} from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Partner Directory sub-client (architecture: Integration Suite Client, §4). Thin facade over
 * {@link IPartnerDirectoryProvider} for the CoE Framework's configuration surfaces, mirroring
 * `PayloadClient`'s shape.
 */
export class PartnerDirectoryClient {
  public constructor(
    private readonly provider: IPartnerDirectoryProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Reads one string parameter. See {@link IPartnerDirectoryProvider.getStringParameter}. */
  public getStringParameter(
    pid: string,
    id: string,
    context?: ClientCallContext,
  ): Promise<PartnerDirectoryStringParameter | undefined> {
    return this.provider.getStringParameter(resolveContext(this.defaultTenantId, context), pid, id);
  }

  /** Lists every string parameter under one Partner ID. See {@link IPartnerDirectoryProvider.listStringParameters}. */
  public listStringParameters(
    pid: string,
    context?: ClientCallContext,
  ): Promise<readonly PartnerDirectoryStringParameter[]> {
    return this.provider.listStringParameters(resolveContext(this.defaultTenantId, context), pid);
  }

  /** Creates or updates one string parameter. See {@link IPartnerDirectoryProvider.upsertStringParameter}. */
  public upsertStringParameter(
    parameter: { readonly pid: string; readonly id: string; readonly value: string },
    context?: ClientCallContext,
  ): Promise<PartnerDirectoryStringParameter> {
    return this.provider.upsertStringParameter(
      resolveContext(this.defaultTenantId, context),
      parameter,
    );
  }

  /** Deletes one string parameter. See {@link IPartnerDirectoryProvider.deleteStringParameter}. */
  public deleteStringParameter(
    pid: string,
    id: string,
    context?: ClientCallContext,
  ): Promise<void> {
    return this.provider.deleteStringParameter(
      resolveContext(this.defaultTenantId, context),
      pid,
      id,
    );
  }

  /** Reads one binary parameter. See {@link IPartnerDirectoryProvider.getBinaryParameter}. */
  public getBinaryParameter(
    pid: string,
    id: string,
    context?: ClientCallContext,
  ): Promise<PartnerDirectoryBinaryParameter | undefined> {
    return this.provider.getBinaryParameter(resolveContext(this.defaultTenantId, context), pid, id);
  }

  /** Lists every binary parameter under one Partner ID. See {@link IPartnerDirectoryProvider.listBinaryParameters}. */
  public listBinaryParameters(
    pid: string,
    context?: ClientCallContext,
  ): Promise<readonly PartnerDirectoryBinaryParameter[]> {
    return this.provider.listBinaryParameters(resolveContext(this.defaultTenantId, context), pid);
  }

  /** Creates or updates one binary parameter. See {@link IPartnerDirectoryProvider.upsertBinaryParameter}. */
  public upsertBinaryParameter(
    parameter: {
      readonly pid: string;
      readonly id: string;
      readonly contentType: string;
      readonly valueBase64: string;
    },
    context?: ClientCallContext,
  ): Promise<PartnerDirectoryBinaryParameter> {
    return this.provider.upsertBinaryParameter(
      resolveContext(this.defaultTenantId, context),
      parameter,
    );
  }

  /** Deletes one binary parameter. See {@link IPartnerDirectoryProvider.deleteBinaryParameter}. */
  public deleteBinaryParameter(
    pid: string,
    id: string,
    context?: ClientCallContext,
  ): Promise<void> {
    return this.provider.deleteBinaryParameter(
      resolveContext(this.defaultTenantId, context),
      pid,
      id,
    );
  }
}
