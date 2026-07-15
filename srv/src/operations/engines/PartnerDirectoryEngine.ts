import type { PartnerDirectoryClient } from "../../sdk/client/PartnerDirectoryClient.js";
import type {
  PartnerDirectoryBinaryParameter,
  PartnerDirectoryStringParameter,
} from "../../core/providers/types.js";
import type {
  PartnerDirectoryBinaryParameterDto,
  PartnerDirectoryParameterDto,
} from "../dto/PartnerDirectoryDto.js";
import { OperationsCache } from "../cache/index.js";

/**
 * Business-logic layer over the Partner Directory SDK sub-client (the CoE Framework's configuration
 * store). Reads are request-cached; writes go straight through (and are never cached). Shapes the
 * neutral provider domain type into the {@link PartnerDirectoryParameterDto} module services consume.
 */
export class PartnerDirectoryEngine {
  public constructor(
    private readonly client: PartnerDirectoryClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Reads one string parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @returns the parameter, or `undefined` when it does not exist.
   */
  public async getStringParameter(
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryParameterDto | undefined> {
    return this.cache.dedupe(`partnerDirectory.get:${pid}:${id}`, async () => {
      const parameter = await this.client.getStringParameter(pid, id);
      return parameter === undefined ? undefined : PartnerDirectoryEngine.toDto(parameter);
    });
  }

  /**
   * Lists every string parameter under one Partner ID (request-cached).
   * @param pid the owning Partner ID.
   * @returns the parameters under `pid`; empty when the PID has none.
   */
  public async listStringParameters(pid: string): Promise<readonly PartnerDirectoryParameterDto[]> {
    return this.cache.dedupe(`partnerDirectory.list:${pid}`, async () => {
      const parameters = await this.client.listStringParameters(pid);
      return parameters.map(PartnerDirectoryEngine.toDto);
    });
  }

  /**
   * Creates or updates one string parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @param value the value to persist.
   * @returns the persisted parameter as read back from the tenant.
   */
  public async saveStringParameter(
    pid: string,
    id: string,
    value: string,
  ): Promise<PartnerDirectoryParameterDto> {
    const parameter = await this.client.upsertStringParameter({ pid, id, value });
    return PartnerDirectoryEngine.toDto(parameter);
  }

  /**
   * Deletes one string parameter (no-op when it does not exist).
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   */
  public async deleteStringParameter(pid: string, id: string): Promise<void> {
    await this.client.deleteStringParameter(pid, id);
  }

  /**
   * Reads one binary parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @returns the parameter, or `undefined` when it does not exist.
   */
  public async getBinaryParameter(
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryBinaryParameterDto | undefined> {
    return this.cache.dedupe(`partnerDirectory.getBinary:${pid}:${id}`, async () => {
      const parameter = await this.client.getBinaryParameter(pid, id);
      return parameter === undefined ? undefined : PartnerDirectoryEngine.toBinaryDto(parameter);
    });
  }

  /**
   * Lists every binary parameter under one Partner ID (request-cached).
   * @param pid the owning Partner ID.
   * @returns the parameters under `pid`; empty when the PID has none.
   */
  public async listBinaryParameters(
    pid: string,
  ): Promise<readonly PartnerDirectoryBinaryParameterDto[]> {
    return this.cache.dedupe(`partnerDirectory.listBinary:${pid}`, async () => {
      const parameters = await this.client.listBinaryParameters(pid);
      return parameters.map(PartnerDirectoryEngine.toBinaryDto);
    });
  }

  /**
   * Creates or updates one binary parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @param contentType MIME type of the decoded value.
   * @param valueBase64 the base64-encoded value to persist.
   * @returns the persisted parameter as read back from the tenant.
   */
  public async saveBinaryParameter(
    pid: string,
    id: string,
    contentType: string,
    valueBase64: string,
  ): Promise<PartnerDirectoryBinaryParameterDto> {
    const parameter = await this.client.upsertBinaryParameter({
      pid,
      id,
      contentType,
      valueBase64,
    });
    return PartnerDirectoryEngine.toBinaryDto(parameter);
  }

  /**
   * Deletes one binary parameter (no-op when it does not exist).
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   */
  public async deleteBinaryParameter(pid: string, id: string): Promise<void> {
    await this.client.deleteBinaryParameter(pid, id);
  }

  private static toDto(parameter: PartnerDirectoryStringParameter): PartnerDirectoryParameterDto {
    return {
      pid: parameter.pid,
      id: parameter.id,
      value: parameter.value,
      lastModifiedBy: parameter.lastModifiedBy,
      lastModifiedAt: parameter.lastModifiedAt,
    };
  }

  private static toBinaryDto(
    parameter: PartnerDirectoryBinaryParameter,
  ): PartnerDirectoryBinaryParameterDto {
    return {
      pid: parameter.pid,
      id: parameter.id,
      contentType: parameter.contentType,
      valueBase64: parameter.valueBase64,
      lastModifiedBy: parameter.lastModifiedBy,
      lastModifiedAt: parameter.lastModifiedAt,
    };
  }
}
