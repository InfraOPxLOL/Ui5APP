import type { IAlertProvider } from "../../core/providers/IAlertProvider.js";
import type {
  AlertEvent,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateAlerts } from "../mock/fixtures/index.js";

/** Mock implementation of {@link IAlertProvider} (architecture: Provider Framework, §10). */
export class MockAlertProvider implements IAlertProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async queryAlerts(
    context: ProviderContext,
    page: ProviderPage,
    severity?: string,
  ): Promise<ProviderPagedResult<AlertEvent>> {
    const all = await this.mockEngine.resolve({
      operationKey: "alert.queryAlerts",
      tenantId: context.tenantId,
      generateSuccess: () => generateAlerts(30),
      generateEmpty: () => [],
      generateLarge: () => generateAlerts(250),
    });
    const filtered =
      severity !== undefined ? all.filter((alert) => alert.severity === severity) : all;
    return { items: filtered.slice(page.skip, page.skip + page.top), total: filtered.length };
  }

  /** @inheritdoc */
  public async getAlert(
    context: ProviderContext,
    alertId: string,
  ): Promise<AlertEvent | undefined> {
    const all = await this.mockEngine.resolve({
      operationKey: "alert.getAlert",
      tenantId: context.tenantId,
      generateSuccess: () => generateAlerts(30),
    });
    return all.find((alert) => alert.alertId === alertId) ?? all[0];
  }
}
