import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PartnerDirectoryParameterDto } from "../../operations/dto/index.js";
import type { CoeGlobalSettingsDto, CoeGlobalSettingsUpdate } from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/** The master CoE Partner ID whose parameters hold the global framework settings (spec §3). */
const SYS_PID = ".SYS_JMS_FRAMEWORK";

/** The four parameter ids under {@link SYS_PID} that back the global settings form (spec §3). */
const PARAM_IDS = {
  environment: "Environment",
  defaultRetries: "DEFAULT_RETRIES",
  defaultExceptionTo: "Default_Exception_To",
  defaultEgressUri: "X-Default-Egress-URI",
} as const;

/**
 * Aggregation service for the CoE Admin module (spec §3 — Global Framework Configurations). Builds a
 * fresh, request-scoped {@link OperationsEngine} per call (matching every other Operations-Engine-
 * consuming module) and reads/writes the four `.SYS_JMS_FRAMEWORK` string parameters through
 * `engine.partnerDirectory`. No SDK, OData or CPI shape ever leaves this layer.
 */
export class CoeAdminService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Reads the current global settings from the Partner Directory.
   * @returns the four settings; any field is `undefined` when not yet set on the tenant.
   */
  public async getGlobalSettings(): Promise<CoeGlobalSettingsDto> {
    const engine = this.engineFactory();
    const [environment, defaultRetries, defaultExceptionTo, defaultEgressUri] = await Promise.all([
      engine.partnerDirectory.getStringParameter(SYS_PID, PARAM_IDS.environment),
      engine.partnerDirectory.getStringParameter(SYS_PID, PARAM_IDS.defaultRetries),
      engine.partnerDirectory.getStringParameter(SYS_PID, PARAM_IDS.defaultExceptionTo),
      engine.partnerDirectory.getStringParameter(SYS_PID, PARAM_IDS.defaultEgressUri),
    ]);
    return CoeAdminService.toDto([
      environment,
      defaultRetries,
      defaultExceptionTo,
      defaultEgressUri,
    ]);
  }

  /**
   * Persists the global settings, writing each field as a `.SYS_JMS_FRAMEWORK` string parameter.
   * @param update the validated settings.
   * @returns the settings as read back from the tenant after the write.
   */
  public async saveGlobalSettings(update: CoeGlobalSettingsUpdate): Promise<CoeGlobalSettingsDto> {
    const engine = this.engineFactory();
    await Promise.all([
      engine.partnerDirectory.saveStringParameter(
        SYS_PID,
        PARAM_IDS.environment,
        update.environment,
      ),
      engine.partnerDirectory.saveStringParameter(
        SYS_PID,
        PARAM_IDS.defaultRetries,
        String(update.defaultRetries),
      ),
      engine.partnerDirectory.saveStringParameter(
        SYS_PID,
        PARAM_IDS.defaultExceptionTo,
        update.defaultExceptionTo,
      ),
      engine.partnerDirectory.saveStringParameter(
        SYS_PID,
        PARAM_IDS.defaultEgressUri,
        update.defaultEgressUri,
      ),
    ]);
    return this.getGlobalSettings();
  }

  private static toDto(
    parameters: readonly (PartnerDirectoryParameterDto | undefined)[],
  ): CoeGlobalSettingsDto {
    const [environment, defaultRetries, defaultExceptionTo, defaultEgressUri] = parameters;
    const retries = defaultRetries?.value === undefined ? undefined : Number(defaultRetries.value);
    return {
      environment: environment?.value,
      defaultRetries: retries === undefined || Number.isNaN(retries) ? undefined : retries,
      defaultExceptionTo: defaultExceptionTo?.value,
      defaultEgressUri: defaultEgressUri?.value,
      lastModifiedBy: CoeAdminService.mostRecentModifier(parameters),
      lastModifiedAt: CoeAdminService.mostRecentTimestamp(parameters),
    };
  }

  private static mostRecentTimestamp(
    parameters: readonly (PartnerDirectoryParameterDto | undefined)[],
  ): string | undefined {
    const timestamps = parameters
      .map((parameter) => parameter?.lastModifiedAt)
      .filter((value): value is string => value !== undefined)
      .sort();
    return timestamps.at(-1);
  }

  private static mostRecentModifier(
    parameters: readonly (PartnerDirectoryParameterDto | undefined)[],
  ): string | undefined {
    const latest = parameters
      .filter(
        (parameter): parameter is PartnerDirectoryParameterDto =>
          parameter?.lastModifiedAt !== undefined,
      )
      .sort((a, b) => (a.lastModifiedAt ?? "").localeCompare(b.lastModifiedAt ?? ""))
      .at(-1);
    return latest?.lastModifiedBy;
  }
}

/** Shared service instance. */
export const coeAdminService = new CoeAdminService();
