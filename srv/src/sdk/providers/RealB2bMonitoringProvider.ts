import type { IB2bMonitoringProvider } from "../../core/providers/IB2bMonitoringProvider.js";
import type {
  B2bErrorDetail,
  B2bInterchange,
  B2bInterchangeDetail,
  B2bInterchangeFilter,
  B2bPartySide,
  B2bPayloadContent,
  B2bPayloadInfo,
  B2bProcessingEvent,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { RequestPipeline } from "../pipeline/RequestPipeline.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { TenantContext } from "../models/TenantContext.js";
import { ODataClient } from "../odata/ODataClient.js";
import { ODataFilter } from "../odata/ODataFilter.js";
import type { ODataFilterExpression } from "../odata/ODataFilterExpression.js";
import { ODataQueryBuilder } from "../odata/ODataQueryBuilder.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { parseODataV2DateTime, toODataV2KeyLiteral } from "./RealProviderSupport.js";

/** Entity-set and navigation names of the B2B Monitoring API, overridable without a code change. */
export interface B2bMonitoringEndpoints {
  readonly interchangeEntitySet: string;
  readonly payloadEntitySet: string;
  readonly eventEntitySet: string;
  readonly eventsNavigation: string;
  readonly payloadsNavigation: string;
  readonly errorsNavigation: string;
  readonly eventDocumentNavigation: string;
}

export const DEFAULT_B2B_ENDPOINTS: B2bMonitoringEndpoints = {
  interchangeEntitySet: "BusinessDocuments",
  payloadEntitySet: "BusinessDocumentPayloads",
  eventEntitySet: "BusinessDocumentProcessingEvents",
  eventsNavigation: "BusinessDocumentProcessingEvents",
  payloadsNavigation: "BusinessDocumentPayloads",
  errorsNavigation: "LastErrorDetails",
  eventDocumentNavigation: "BusinessDocument",
};

/** Raw `BusinessDocument` (the subset this platform reads; all other properties are ignored). */
interface CpiBusinessDocument {
  readonly Id: string;
  readonly OverallStatus?: string;
  readonly ProcessingStatus?: string;
  readonly StartedAt?: string;
  readonly EndedAt?: string;
  readonly DocumentCreationTime?: string;
  readonly InterchangeName?: string;
  readonly InterchangeDirection?: string;
  readonly AgreementTypeName?: string;
  readonly TransactionTypeName?: string;
  readonly TransactionDocumentType?: string;
  readonly ReceiverTechnicalAckStatus?: string;
  readonly ReceiverFunctionalAckStatus?: string;
  readonly ArchivingStatus?: string;
  readonly RetryAllowed?: boolean;
  readonly ResendAllowed?: boolean;
  readonly SenderTradingPartnerName?: string;
  readonly SenderCommunicationPartnerName?: string;
  readonly SenderSystemId?: string;
  readonly SenderAdapterType?: string;
  readonly SenderDocumentStandard?: string;
  readonly SenderMessageType?: string;
  readonly SenderInterchangeControlNumber?: string;
  readonly SenderGroupControlNumber?: string;
  readonly SenderMessageNumber?: string;
  readonly ReceiverTradingPartnerName?: string;
  readonly ReceiverCommunicationPartnerName?: string;
  readonly ReceiverSystemId?: string;
  readonly ReceiverAdapterType?: string;
  readonly ReceiverDocumentStandard?: string;
  readonly ReceiverMessageType?: string;
  readonly ReceiverInterchangeControlNumber?: string;
  readonly ReceiverGroupControlNumber?: string;
  readonly ReceiverMessageNumber?: string;
}

interface CpiProcessingEvent {
  readonly Id: string;
  readonly EventType?: string;
  readonly Date?: string;
  readonly MonitoringType?: string;
  readonly MonitoringId?: string;
}

interface CpiPayload {
  readonly Id: string;
  readonly PayloadId?: string;
  readonly Direction?: string;
  readonly ProcessingState?: string;
  readonly PayloadContentType?: string;
  readonly PayloadContainerContentType?: string;
}

interface CpiErrorDetails {
  readonly Id: string;
  readonly ErrorInformation?: string;
  readonly ErrorCategory?: string;
  readonly IsTransientError?: boolean;
}

/** Content types decoded as UTF-8; EDI (X12/EDIFACT) is text too. Everything else is base64. */
const TEXT_CONTENT_TYPES = [
  "text/",
  "application/xml",
  "application/json",
  "application/edi",
  "application/edifact",
  "application/x12",
];

function isTextContentType(contentType: string | undefined): boolean {
  if (contentType === undefined || contentType === "") {
    return true;
  }
  const normalized = contentType.toLowerCase();
  return TEXT_CONTENT_TYPES.some((candidate) => normalized.startsWith(candidate));
}

/**
 * Live implementation of {@link IB2bMonitoringProvider} on Cloud Integration's B2B Monitoring OData
 * API (`/api/v1/BusinessDocuments` and navigations). The API is only provisioned on tenants with
 * Trading Partner Management activated; elsewhere every call fails upstream with a 500.
 */
export class RealB2bMonitoringProvider implements IB2bMonitoringProvider {
  private readonly odataClient: ODataClient;
  private readonly restClient: SdkRestClient;

  public constructor(
    private readonly pipeline: RequestPipeline,
    httpClient: IHttpClient,
    private readonly endpoints: B2bMonitoringEndpoints = DEFAULT_B2B_ENDPOINTS,
  ) {
    this.odataClient = new ODataClient(httpClient, "v2");
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async queryInterchanges(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<B2bInterchange>> {
    return this.pipeline.run({
      operationName: "b2b.queryInterchanges",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const builder = new ODataQueryBuilder()
          .top(page.top)
          .skip(page.skip)
          .orderBy("StartedAt", "desc")
          .count();
        const expression = RealB2bMonitoringProvider.toFilterExpression(filter);
        if (expression !== undefined) {
          builder.filter(expression);
        }
        const paged = await this.odataClient.queryPage<CpiBusinessDocument>(
          `${tenant.baseUrl}/${this.endpoints.interchangeEntitySet}`,
          builder,
          tenant,
          opContext,
          page,
        );
        return {
          items: paged.items.map(RealB2bMonitoringProvider.toInterchange),
          total: paged.total,
        };
      },
    });
  }

  /** @inheritdoc */
  public async listStatuses(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    limit: number,
  ): Promise<readonly string[]> {
    return this.pipeline.run({
      operationName: "b2b.listStatuses",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const builder = new ODataQueryBuilder()
          .top(limit)
          .orderBy("StartedAt", "desc")
          .select("Id", "OverallStatus");
        const expression = RealB2bMonitoringProvider.toFilterExpression(filter);
        if (expression !== undefined) {
          builder.filter(expression);
        }
        const rows = await this.odataClient.query<CpiBusinessDocument>(
          `${tenant.baseUrl}/${this.endpoints.interchangeEntitySet}`,
          builder,
          tenant,
          opContext,
        );
        return rows.value.map((row) => row.OverallStatus ?? "UNKNOWN");
      },
    });
  }

  /** @inheritdoc */
  public async getInterchange(
    context: ProviderContext,
    id: string,
  ): Promise<B2bInterchangeDetail | undefined> {
    return this.pipeline.run({
      operationName: "b2b.getInterchange",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const entityUrl = `${tenant.baseUrl}/${this.endpoints.interchangeEntitySet}(${toODataV2KeyLiteral(id)})`;
        const raw = await this.odataClient.getEntity<CpiBusinessDocument>(
          entityUrl,
          tenant,
          opContext,
        );
        if (raw === undefined) {
          return undefined;
        }
        const [events, payloads, errors] = await Promise.all([
          this.readNavigation<CpiProcessingEvent>(
            `${entityUrl}/${this.endpoints.eventsNavigation}`,
            tenant,
            opContext,
          ),
          this.readNavigation<CpiPayload>(
            `${entityUrl}/${this.endpoints.payloadsNavigation}`,
            tenant,
            opContext,
          ),
          this.readNavigation<CpiErrorDetails>(
            `${entityUrl}/${this.endpoints.errorsNavigation}`,
            tenant,
            opContext,
          ),
        ]);
        return {
          interchange: RealB2bMonitoringProvider.toInterchange(raw),
          events: events
            .map(RealB2bMonitoringProvider.toEvent)
            .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
          payloads: payloads.map(RealB2bMonitoringProvider.toPayloadInfo),
          errors: errors.map(RealB2bMonitoringProvider.toError),
        };
      },
    });
  }

  /** @inheritdoc */
  public async getPayload(
    context: ProviderContext,
    payloadEntityId: string,
  ): Promise<B2bPayloadContent | undefined> {
    return this.pipeline.run({
      operationName: "b2b.getPayload",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const entityUrl = `${tenant.baseUrl}/${this.endpoints.payloadEntitySet}(${toODataV2KeyLiteral(payloadEntityId)})`;
        const metadata = await this.odataClient.getEntity<CpiPayload>(entityUrl, tenant, opContext);
        if (metadata === undefined) {
          return undefined;
        }
        const binary = await this.restClient.getBinary(`${entityUrl}/$value`, opContext, {
          headers: tenant.headers,
        });
        const info = RealB2bMonitoringProvider.toPayloadInfo(metadata);
        const asText = isTextContentType(info.contentType);
        return {
          ...info,
          content: Buffer.from(binary.data).toString(asText ? "utf8" : "base64"),
          encoding: asText ? "text" : "base64",
        };
      },
    });
  }

  /** @inheritdoc */
  public async findInterchangeByMplId(
    context: ProviderContext,
    mplId: string,
  ): Promise<B2bInterchange | undefined> {
    return this.pipeline.run({
      operationName: "b2b.findInterchangeByMplId",
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      execute: async (tenant, opContext) => {
        const events = await this.odataClient.query<CpiProcessingEvent>(
          `${tenant.baseUrl}/${this.endpoints.eventEntitySet}`,
          new ODataQueryBuilder().top(1).filter(ODataFilter.eq("MonitoringId", mplId)),
          tenant,
          opContext,
        );
        const event = events.value[0];
        if (event === undefined) {
          return undefined;
        }
        const document = await this.odataClient.getEntity<CpiBusinessDocument>(
          `${tenant.baseUrl}/${this.endpoints.eventEntitySet}(${toODataV2KeyLiteral(event.Id)})/${this.endpoints.eventDocumentNavigation}`,
          tenant,
          opContext,
        );
        return document === undefined
          ? undefined
          : RealB2bMonitoringProvider.toInterchange(document);
      },
    });
  }

  /**
   * Reads a navigation that may be a collection (`{results:[…]}`) or a single entity; a navigation
   * the tenant reports as absent (404) reads as empty.
   */
  private async readNavigation<T>(
    url: string,
    tenant: TenantContext,
    opContext: OperationContext,
  ): Promise<readonly T[]> {
    const body = await this.odataClient.getEntity<T | { readonly results?: readonly T[] }>(
      url,
      tenant,
      opContext,
    );
    if (body === undefined || body === null) {
      return [];
    }
    if (typeof body === "object" && "results" in body && Array.isArray(body.results)) {
      return body.results;
    }
    return [body as T];
  }

  private static toFilterExpression(
    filter: B2bInterchangeFilter,
  ): ODataFilterExpression | undefined {
    const parts: ODataFilterExpression[] = [];
    if (filter.from !== undefined) {
      parts.push(ODataFilter.ge("StartedAt", new Date(filter.from)));
    }
    if (filter.to !== undefined) {
      parts.push(ODataFilter.le("StartedAt", new Date(filter.to)));
    }
    if (filter.overallStatus !== undefined) {
      parts.push(ODataFilter.eq("OverallStatus", filter.overallStatus));
    }
    if (filter.senderPartner !== undefined) {
      parts.push(ODataFilter.contains("SenderTradingPartnerName", filter.senderPartner));
    }
    if (filter.receiverPartner !== undefined) {
      parts.push(ODataFilter.contains("ReceiverTradingPartnerName", filter.receiverPartner));
    }
    if (filter.documentStandard !== undefined) {
      parts.push(
        ODataFilter.or(
          ODataFilter.eq("SenderDocumentStandard", filter.documentStandard),
          ODataFilter.eq("ReceiverDocumentStandard", filter.documentStandard),
        ),
      );
    }
    if (filter.messageType !== undefined) {
      parts.push(
        ODataFilter.or(
          ODataFilter.eq("SenderMessageType", filter.messageType),
          ODataFilter.eq("ReceiverMessageType", filter.messageType),
        ),
      );
    }
    if (filter.controlNumber !== undefined) {
      parts.push(
        ODataFilter.or(
          ODataFilter.contains("SenderInterchangeControlNumber", filter.controlNumber),
          ODataFilter.contains("ReceiverInterchangeControlNumber", filter.controlNumber),
        ),
      );
    }
    const exact: readonly [string, string | undefined][] = [
      ["Id", filter.interchangeId],
      ["InterchangeDirection", filter.direction],
      ["ProcessingStatus", filter.processingStatus],
      ["ReceiverTechnicalAckStatus", filter.technicalAckStatus],
      ["ReceiverFunctionalAckStatus", filter.functionalAckStatus],
    ];
    for (const [field, value] of exact) {
      if (value !== undefined) {
        parts.push(ODataFilter.eq(field, value));
      }
    }
    const partial: readonly [string, string | undefined][] = [
      ["AgreementTypeName", filter.agreementTypeName],
      ["TransactionTypeName", filter.transactionTypeName],
      ["InterchangeName", filter.interchangeName],
    ];
    for (const [field, value] of partial) {
      if (value !== undefined) {
        parts.push(ODataFilter.contains(field, value));
      }
    }
    // Sender or receiver side — either one matching is enough.
    const eitherSide: readonly [string, string | undefined, "eq" | "contains"][] = [
      ["SystemId", filter.systemId, "contains"],
      ["AdapterType", filter.adapterType, "eq"],
      ["GroupControlNumber", filter.groupControlNumber, "contains"],
      ["MessageNumber", filter.messageNumber, "contains"],
    ];
    for (const [field, value, match] of eitherSide) {
      if (value !== undefined) {
        parts.push(
          ODataFilter.or(
            ODataFilter[match](`Sender${field}`, value),
            ODataFilter[match](`Receiver${field}`, value),
          ),
        );
      }
    }
    if (parts.length === 0) {
      return undefined;
    }
    return parts.length === 1 ? parts[0] : ODataFilter.and(...parts);
  }

  private static side(raw: CpiBusinessDocument, prefix: "Sender" | "Receiver"): B2bPartySide {
    const pick = (field: string): string | undefined => {
      const value = (raw as unknown as Record<string, unknown>)[`${prefix}${field}`];
      return typeof value === "string" && value !== "" ? value : undefined;
    };
    return {
      tradingPartnerName: pick("TradingPartnerName"),
      communicationPartnerName: pick("CommunicationPartnerName"),
      systemId: pick("SystemId"),
      adapterType: pick("AdapterType"),
      documentStandard: pick("DocumentStandard"),
      messageType: pick("MessageType"),
      interchangeControlNumber: pick("InterchangeControlNumber"),
      groupControlNumber: pick("GroupControlNumber"),
      messageNumber: pick("MessageNumber"),
    };
  }

  private static toInterchange(this: void, raw: CpiBusinessDocument): B2bInterchange {
    const text = (value: string | undefined): string | undefined =>
      value === undefined || value === "" ? undefined : value;
    return {
      id: raw.Id,
      overallStatus: raw.OverallStatus ?? "UNKNOWN",
      processingStatus: text(raw.ProcessingStatus),
      startedAt: parseODataV2DateTime(raw.StartedAt),
      endedAt: parseODataV2DateTime(raw.EndedAt),
      documentCreationTime: parseODataV2DateTime(raw.DocumentCreationTime),
      interchangeName: text(raw.InterchangeName),
      direction: text(raw.InterchangeDirection),
      agreementTypeName: text(raw.AgreementTypeName),
      transactionTypeName: text(raw.TransactionTypeName),
      transactionDocumentType: text(raw.TransactionDocumentType),
      receiverTechnicalAckStatus: text(raw.ReceiverTechnicalAckStatus),
      receiverFunctionalAckStatus: text(raw.ReceiverFunctionalAckStatus),
      archivingStatus: text(raw.ArchivingStatus),
      retryAllowed: raw.RetryAllowed === true,
      resendAllowed: raw.ResendAllowed === true,
      sender: RealB2bMonitoringProvider.side(raw, "Sender"),
      receiver: RealB2bMonitoringProvider.side(raw, "Receiver"),
    };
  }

  private static toEvent(this: void, raw: CpiProcessingEvent): B2bProcessingEvent {
    return {
      id: raw.Id,
      eventType: raw.EventType ?? "UNKNOWN",
      date: parseODataV2DateTime(raw.Date),
      monitoringType: raw.MonitoringType === "" ? undefined : raw.MonitoringType,
      monitoringId: raw.MonitoringId === "" ? undefined : raw.MonitoringId,
    };
  }

  private static toPayloadInfo(this: void, raw: CpiPayload): B2bPayloadInfo {
    return {
      id: raw.Id,
      payloadId: raw.PayloadId,
      direction: raw.Direction,
      processingState: raw.ProcessingState,
      contentType: raw.PayloadContentType,
      containerContentType: raw.PayloadContainerContentType,
    };
  }

  private static toError(this: void, raw: CpiErrorDetails): B2bErrorDetail {
    return {
      id: raw.Id,
      errorInformation: raw.ErrorInformation ?? "",
      errorCategory: raw.ErrorCategory === "" ? undefined : raw.ErrorCategory,
      transientError: raw.IsTransientError,
    };
  }
}
