import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PartnerDirectoryParameterDto } from "../../operations/dto/index.js";
import type { RegistryListDto, RegistryParameterDto, RegistryUpdate } from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/**
 * Aggregation service for the Global Partner Parameter Registry (spec §2, Tile 3). Lists, edits and
 * deletes Partner Directory string parameters under a Partner ID through `engine.partnerDirectory`.
 * No SDK/OData/CPI shape leaves this layer.
 */
export class CoeRegistryService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Lists every string parameter under a Partner ID.
   * @param pid the owning Partner ID.
   * @returns the parameters (empty when the PID has none).
   */
  public async listByPid(pid: string): Promise<RegistryListDto> {
    const engine = this.engineFactory();
    const parameters = await engine.partnerDirectory.listStringParameters(pid);
    return { pid, parameters: parameters.map(CoeRegistryService.toDto) };
  }

  /**
   * Edits (or creates) one parameter's value.
   * @param update the parameter to persist.
   * @returns the persisted parameter as read back from the tenant.
   */
  public async updateParameter(update: RegistryUpdate): Promise<RegistryParameterDto> {
    const engine = this.engineFactory();
    const saved = await engine.partnerDirectory.saveStringParameter(
      update.pid,
      update.id,
      update.value,
    );
    return CoeRegistryService.toDto(saved);
  }

  /**
   * Deletes one parameter.
   * @param pid the owning Partner ID.
   * @param id the parameter id.
   */
  public async deleteParameter(pid: string, id: string): Promise<void> {
    const engine = this.engineFactory();
    await engine.partnerDirectory.deleteStringParameter(pid, id);
  }

  private static toDto(parameter: PartnerDirectoryParameterDto): RegistryParameterDto {
    return {
      pid: parameter.pid,
      id: parameter.id,
      value: parameter.value,
      lastModifiedBy: parameter.lastModifiedBy,
      lastModifiedAt: parameter.lastModifiedAt,
    };
  }
}

/** Shared service instance. */
export const coeRegistryService = new CoeRegistryService();
