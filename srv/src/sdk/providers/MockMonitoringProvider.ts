import type { IMonitoringProvider } from "../../core/providers/IMonitoringProvider.js";
import type {
  MessageErrorDetail,
  MessageHeader,
  MessageLogFilter,
  MessageProcessingLog,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import {
  generateCustomHeaders,
  generateErrorDetails,
  generateMessageLogs,
} from "../mock/fixtures/index.js";

/**
 * Mock implementation of {@link IMonitoringProvider} (architecture: Provider Framework, §10).
 * Generates a scenario-appropriate dataset per call via the {@link MockEngine}, then applies
 * filtering/pagination/aggregation over it in memory — exercising the same client-facing contract
 * a real CPI-backed implementation will, without any upstream connectivity.
 */
export class MockMonitoringProvider implements IMonitoringProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async queryMessageLogs(
    context: ProviderContext,
    filter: MessageLogFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<MessageProcessingLog>> {
    const all = await this.mockEngine.resolve({
      operationKey: "monitoring.queryMessageLogs",
      tenantId: context.tenantId,
      generateSuccess: () => generateMessageLogs(50),
      generateEmpty: () => [],
      generateLarge: () => generateMessageLogs(250),
    });
    const filtered = all.filter((log) => MockMonitoringProvider.matchesFilter(log, filter));
    return {
      items: filtered.slice(page.skip, page.skip + page.top),
      total: filtered.length,
    };
  }

  /** @inheritdoc */
  public async getMessageLog(
    context: ProviderContext,
    messageId: string,
  ): Promise<MessageProcessingLog | undefined> {
    const all = await this.mockEngine.resolve({
      operationKey: "monitoring.getMessageLog",
      tenantId: context.tenantId,
      generateSuccess: () => generateMessageLogs(50),
    });
    return all.find((log) => log.messageId === messageId);
  }

  /** @inheritdoc */
  public async getErrorDetails(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly MessageErrorDetail[]> {
    return this.mockEngine.resolve({
      operationKey: "monitoring.getErrorDetails",
      tenantId: context.tenantId,
      generateSuccess: () => generateErrorDetails(messageId),
      generateEmpty: () => [],
    });
  }

  /** @inheritdoc */
  public async countByStatus(
    context: ProviderContext,
    fromIso: string,
    toIso: string,
  ): Promise<Readonly<Record<string, number>>> {
    const all = await this.mockEngine.resolve({
      operationKey: "monitoring.countByStatus",
      tenantId: context.tenantId,
      generateSuccess: () => generateMessageLogs(200),
    });
    const counts: Record<string, number> = {};
    for (const log of all) {
      if (log.startTime >= fromIso && log.startTime <= toIso) {
        counts[log.status] = (counts[log.status] ?? 0) + 1;
      }
    }
    return counts;
  }

  /** @inheritdoc */
  public async getCustomHeaders(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly MessageHeader[]> {
    return this.mockEngine.resolve({
      operationKey: "monitoring.getCustomHeaders",
      tenantId: context.tenantId,
      generateSuccess: () => generateCustomHeaders(messageId),
      generateEmpty: () => [],
    });
  }

  private static matchesFilter(log: MessageProcessingLog, filter: MessageLogFilter): boolean {
    if (filter.status !== undefined && log.status !== filter.status) {
      return false;
    }
    if (filter.integrationFlow !== undefined && log.integrationFlow !== filter.integrationFlow) {
      return false;
    }
    if (filter.from !== undefined && log.startTime < filter.from) {
      return false;
    }
    if (filter.to !== undefined && log.startTime > filter.to) {
      return false;
    }
    if (filter.search !== undefined && filter.search !== "") {
      const needle = filter.search.toLowerCase();
      const haystack = `${log.messageId} ${log.integrationFlow}`.toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    return true;
  }
}
