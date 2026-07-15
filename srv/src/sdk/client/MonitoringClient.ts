import type { IMonitoringProvider } from "../../core/providers/IMonitoringProvider.js";
import type {
  MessageErrorDetail,
  MessageHeader,
  MessageLogFilter,
  MessageProcessingLog,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Message-monitoring sub-client (architecture: Integration Suite Client, §4 — `MonitoringClient`).
 * A thin facade over {@link IMonitoringProvider}: the SDK's public surface for the Message
 * Monitoring, Live Monitoring and Dashboard modules. Holds no business logic itself — every method
 * delegates directly to the injected provider (mock today; a real CPI-backed provider in a future
 * phase, with zero change to this facade).
 */
export class MonitoringClient {
  public constructor(
    private readonly provider: IMonitoringProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Queries message processing logs. See {@link IMonitoringProvider.queryMessageLogs}. */
  public queryMessageLogs(
    filter: MessageLogFilter,
    page: ProviderPage,
    context?: ClientCallContext,
  ): Promise<ProviderPagedResult<MessageProcessingLog>> {
    return this.provider.queryMessageLogs(
      resolveContext(this.defaultTenantId, context),
      filter,
      page,
    );
  }

  /** Reads a single message processing log. See {@link IMonitoringProvider.getMessageLog}. */
  public getMessageLog(
    messageId: string,
    context?: ClientCallContext,
  ): Promise<MessageProcessingLog | undefined> {
    return this.provider.getMessageLog(resolveContext(this.defaultTenantId, context), messageId);
  }

  /** Reads a failed message's error details. See {@link IMonitoringProvider.getErrorDetails}. */
  public getErrorDetails(
    messageId: string,
    context?: ClientCallContext,
  ): Promise<readonly MessageErrorDetail[]> {
    return this.provider.getErrorDetails(resolveContext(this.defaultTenantId, context), messageId);
  }

  /** Counts messages per status within a window. See {@link IMonitoringProvider.countByStatus}. */
  public countByStatus(
    fromIso: string,
    toIso: string,
    context?: ClientCallContext,
  ): Promise<Readonly<Record<string, number>>> {
    return this.provider.countByStatus(
      resolveContext(this.defaultTenantId, context),
      fromIso,
      toIso,
    );
  }

  /** Reads a message's custom headers. See {@link IMonitoringProvider.getCustomHeaders}. */
  public getCustomHeaders(
    messageId: string,
    context?: ClientCallContext,
  ): Promise<readonly MessageHeader[]> {
    return this.provider.getCustomHeaders(resolveContext(this.defaultTenantId, context), messageId);
  }
}
