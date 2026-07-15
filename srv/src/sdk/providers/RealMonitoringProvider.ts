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
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { ODataFilter } from "../odata/ODataFilter.js";
import type { ODataFilterExpression } from "../odata/ODataFilterExpression.js";
import { parseODataV2DateTime, toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Raw shape of one `MessageProcessingLogs` entity, per SAP Integration Suite's OData v1 Monitoring API. */
interface CpiMessageProcessingLog {
  readonly MessageGuid: string;
  readonly CorrelationId?: string;
  readonly IntegrationFlowName?: string;
  readonly Status: string;
  readonly LogStart: string;
  readonly LogEnd?: string;
  readonly Sender?: string;
  readonly Receiver?: string;
  readonly CustomStatus?: string;
  readonly ApplicationMessageId?: string;
  readonly ApplicationMessageType?: string;
}

/** Raw shape of a `MessageProcessingLogs('id')/ErrorInformation` navigation read. */
interface CpiErrorInformation {
  readonly ErrorMessage?: string;
}

/** Raw shape of one `MessageProcessingLogCustomHeaderProperty` entity. */
interface CpiCustomHeaderProperty {
  readonly Id: string;
  readonly Name?: string;
  readonly Value?: string;
}

/**
 * Live implementation of {@link IMonitoringProvider}, backed by SAP Integration Suite's documented
 * OData v1 Monitoring API (`MessageProcessingLogs`) (architecture: Monitoring Provider, §5). Every
 * call runs through the injected {@link RequestPipeline} (destination resolution, error
 * normalization, logging) and reads via {@link ODataClient} (query building, paging, response
 * parsing) — this class owns only the CPI-specific query shape and the raw→domain field mapping; it
 * never touches `fetch` or a raw status code itself.
 */
export class RealMonitoringProvider implements IMonitoringProvider {
  private readonly odataClient: ODataClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
  }

  /** @inheritdoc */
  public async queryMessageLogs(
    context: ProviderContext,
    filter: MessageLogFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<MessageProcessingLog>> {
    return this.pipeline.run({
      operationName: "monitoring.queryMessageLogs",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const builder = new ODataQueryBuilder()
          .top(page.top)
          .skip(page.skip)
          .orderBy("LogStart", "desc")
          .count();
        const filterExpression = RealMonitoringProvider.toFilterExpression(filter);
        if (filterExpression !== undefined) {
          builder.filter(filterExpression);
        }
        const paged = await this.odataClient.queryPage<CpiMessageProcessingLog>(
          `${tenant.baseUrl}/MessageProcessingLogs`,
          builder,
          tenant,
          opContext,
          page,
        );
        return {
          items: paged.items.map(RealMonitoringProvider.toDomain),
          total: paged.total,
        };
      },
    });
  }

  /** @inheritdoc */
  public async getMessageLog(
    context: ProviderContext,
    messageId: string,
  ): Promise<MessageProcessingLog | undefined> {
    return this.pipeline.run({
      operationName: "monitoring.getMessageLog",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.getEntity<CpiMessageProcessingLog>(
          `${tenant.baseUrl}/MessageProcessingLogs(${toODataV2KeyLiteral(messageId)})`,
          tenant,
          opContext,
        );
        return raw === undefined ? undefined : RealMonitoringProvider.toDomain(raw);
      },
    });
  }

  public async getErrorDetails(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly MessageErrorDetail[]> {
    return this.pipeline.run({
      operationName: "monitoring.getErrorDetails",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const log = await this.odataClient.getEntity<CpiMessageProcessingLog>(
          `${tenant.baseUrl}/MessageProcessingLogs(${toODataV2KeyLiteral(messageId)})`,
          tenant,
          opContext,
        );
        if (!log || log.Status === "DISCARDED") {
          return [];
        }

        const raw = await this.odataClient.getEntity<CpiErrorInformation>(
          `${tenant.baseUrl}/MessageProcessingLogs(${toODataV2KeyLiteral(messageId)})/ErrorInformation`,
          tenant,
          opContext,
        );
        if (raw?.ErrorMessage === undefined) {
          return [];
        }
        return [{ messageId, text: raw.ErrorMessage, category: undefined }];
      },
    });
  }

  /** @inheritdoc */
  public async countByStatus(
    context: ProviderContext,
    fromIso: string,
    toIso: string,
  ): Promise<Readonly<Record<string, number>>> {
    return this.pipeline.run({
      operationName: "monitoring.countByStatus",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const builder = new ODataQueryBuilder()
          .filter(
            ODataFilter.and(
              ODataFilter.ge("LogStart", new Date(fromIso)),
              ODataFilter.le("LogStart", new Date(toIso)),
            ),
          )
          .select("Status");
        const items = await this.odataClient.queryAllPages<Pick<CpiMessageProcessingLog, "Status">>(
          `${tenant.baseUrl}/MessageProcessingLogs`,
          builder,
          tenant,
          opContext,
        );
        const counts: Record<string, number> = {};
        for (const item of items) {
          counts[item.Status] = (counts[item.Status] ?? 0) + 1;
        }
        return counts;
      },
    });
  }

  /** @inheritdoc */
  public async getCustomHeaders(
    context: ProviderContext,
    messageId: string,
  ): Promise<readonly MessageHeader[]> {
    return this.pipeline.run({
      operationName: "monitoring.getCustomHeaders",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const raw = await this.odataClient.queryAllPages<CpiCustomHeaderProperty>(
          `${tenant.baseUrl}/MessageProcessingLogs(${toODataV2KeyLiteral(messageId)})/CustomHeaderProperties`,
          new ODataQueryBuilder(),
          tenant,
          opContext,
        );
        return raw
          .filter((entry) => entry.Name !== undefined)
          .map((entry) => ({ name: entry.Name as string, value: entry.Value ?? "" }));
      },
    });
  }

  private static toFilterExpression(filter: MessageLogFilter): ODataFilterExpression | undefined {
    let expression: ODataFilterExpression | undefined;
    const and = (candidate: ODataFilterExpression): void => {
      expression = expression === undefined ? candidate : ODataFilter.and(expression, candidate);
    };
    if (filter.status !== undefined) {
      and(ODataFilter.eq("Status", filter.status));
    }
    if (filter.integrationFlow !== undefined) {
      and(ODataFilter.eq("IntegrationFlowName", filter.integrationFlow));
    }
    if (filter.from !== undefined) {
      and(ODataFilter.ge("LogStart", new Date(filter.from)));
    }
    if (filter.to !== undefined) {
      and(ODataFilter.le("LogStart", new Date(filter.to)));
    }
    if (filter.search !== undefined && filter.search !== "") {
      and(ODataFilter.contains("IntegrationFlowName", filter.search));
    }
    return expression;
  }

  private static toDomain(raw: CpiMessageProcessingLog): MessageProcessingLog {
    const startTime = parseODataV2DateTime(raw.LogStart) ?? raw.LogStart;
    const endTime = parseODataV2DateTime(raw.LogEnd);
    return {
      messageId: raw.MessageGuid,
      correlationId: raw.CorrelationId ?? raw.MessageGuid,
      integrationFlow: raw.IntegrationFlowName ?? "",
      status: raw.Status,
      startTime,
      endTime,
      processingTimeMs:
        endTime !== undefined
          ? new Date(endTime).getTime() - new Date(startTime).getTime()
          : undefined,
      sender: raw.Sender ?? "",
      receiver: raw.Receiver ?? "",
      customStatus: raw.CustomStatus,
      applicationId: raw.ApplicationMessageId,
      messageType: raw.ApplicationMessageType,
    };
  }
}
