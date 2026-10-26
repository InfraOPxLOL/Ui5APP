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
  generateTpmScenarioRuns,
  generateNonB2bRuns,
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
    // The non-B2B framework scenarios are always part of the tenant's logs. A correlation lookup
    // also sees the TPM DLQ scenarios' earlier runs, so retry history has depth.
    const correlated =
      filter.correlationId !== undefined || (filter.correlationIds?.length ?? 0) > 0;
    // An empty tenant (the "empty" mock scenario) has none of them either.
    const extra =
      all.length === 0
        ? []
        : [...generateNonB2bRuns(), ...(correlated ? generateTpmScenarioRuns() : [])];
    const pool = [
      ...all,
      ...extra.filter((run) => !all.some((log) => log.messageId === run.messageId)),
    ].sort((a, b) => b.startTime.localeCompare(a.startTime));
    const filtered = pool.filter((log) => MockMonitoringProvider.matchesFilter(log, filter));
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
    // The TPM DLQ scenarios' runs are linked from Failed Transactions and the Report Server.
    return (
      all.find((log) => log.messageId === messageId) ??
      generateTpmScenarioRuns().find((run) => run.messageId === messageId) ??
      generateNonB2bRuns().find((run) => run.messageId === messageId)
    );
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
    if (filter.correlationId !== undefined && log.correlationId !== filter.correlationId) {
      return false;
    }
    if (
      filter.correlationIds !== undefined &&
      filter.correlationIds.length > 0 &&
      !filter.correlationIds.includes(log.correlationId)
    ) {
      return false;
    }
    if (filter.messageId !== undefined && log.messageId !== filter.messageId) {
      return false;
    }
    if (filter.sender !== undefined && !log.sender.includes(filter.sender)) {
      return false;
    }
    if (filter.receiver !== undefined && !log.receiver.includes(filter.receiver)) {
      return false;
    }
    if (filter.applicationId !== undefined && log.applicationId !== filter.applicationId) {
      return false;
    }
    if (filter.messageType !== undefined && log.messageType !== filter.messageType) {
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
