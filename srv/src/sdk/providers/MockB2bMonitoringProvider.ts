import type { IB2bMonitoringProvider } from "../../core/providers/IB2bMonitoringProvider.js";
import type {
  B2bInterchange,
  B2bInterchangeDetail,
  B2bInterchangeFilter,
  B2bPayloadContent,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import {
  findInterchangeIdByMplId,
  generateInterchangeDetail,
  generateInterchanges,
  generatePayloadContent,
} from "../mock/fixtures/index.js";

const MOCK_INTERCHANGE_COUNT = 120;

/**
 * Mock implementation of {@link IB2bMonitoringProvider}. Filters the generated interchanges in
 * memory with the same semantics {@link RealB2bMonitoringProvider} sends to the tenant.
 */
export class MockB2bMonitoringProvider implements IB2bMonitoringProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async queryInterchanges(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<B2bInterchange>> {
    const all = await this.all(context, "b2b.queryInterchanges");
    const filtered = all.filter((row) => MockB2bMonitoringProvider.matches(row, filter));
    return { items: filtered.slice(page.skip, page.skip + page.top), total: filtered.length };
  }

  /** @inheritdoc */
  public async listStatuses(
    context: ProviderContext,
    filter: B2bInterchangeFilter,
    limit: number,
  ): Promise<readonly string[]> {
    const all = await this.all(context, "b2b.listStatuses");
    return all
      .filter((row) => MockB2bMonitoringProvider.matches(row, filter))
      .slice(0, limit)
      .map((row) => row.overallStatus);
  }

  /** @inheritdoc */
  public async getInterchange(
    context: ProviderContext,
    id: string,
  ): Promise<B2bInterchangeDetail | undefined> {
    const all = await this.all(context, "b2b.getInterchange");
    return generateInterchangeDetail(all, id);
  }

  /** @inheritdoc */
  public async getPayload(
    context: ProviderContext,
    payloadEntityId: string,
  ): Promise<B2bPayloadContent | undefined> {
    const all = await this.all(context, "b2b.getPayload");
    return generatePayloadContent(all, payloadEntityId);
  }

  /** @inheritdoc */
  public async findInterchangeByMplId(
    context: ProviderContext,
    mplId: string,
  ): Promise<B2bInterchange | undefined> {
    const all = await this.all(context, "b2b.findInterchangeByMplId");
    const id = findInterchangeIdByMplId(all, mplId);
    return id === undefined ? undefined : all.find((row) => row.id === id);
  }

  private all(context: ProviderContext, operationKey: string): Promise<B2bInterchange[]> {
    return this.mockEngine.resolve({
      operationKey,
      tenantId: context.tenantId,
      generateSuccess: () => generateInterchanges(MOCK_INTERCHANGE_COUNT),
      generateEmpty: () => [],
      generateLarge: () => generateInterchanges(600),
    });
  }

  private static matches(row: B2bInterchange, filter: B2bInterchangeFilter): boolean {
    const includes = (value: string | undefined, needle: string): boolean =>
      value !== undefined && value.includes(needle);
    if (filter.from !== undefined && (row.startedAt ?? "") < filter.from) {
      return false;
    }
    if (filter.to !== undefined && (row.startedAt ?? "") > filter.to) {
      return false;
    }
    if (filter.overallStatus !== undefined && row.overallStatus !== filter.overallStatus) {
      return false;
    }
    if (
      filter.senderPartner !== undefined &&
      !includes(row.sender.tradingPartnerName, filter.senderPartner)
    ) {
      return false;
    }
    if (
      filter.receiverPartner !== undefined &&
      !includes(row.receiver.tradingPartnerName, filter.receiverPartner)
    ) {
      return false;
    }
    if (
      filter.documentStandard !== undefined &&
      row.sender.documentStandard !== filter.documentStandard &&
      row.receiver.documentStandard !== filter.documentStandard
    ) {
      return false;
    }
    if (
      filter.messageType !== undefined &&
      row.sender.messageType !== filter.messageType &&
      row.receiver.messageType !== filter.messageType
    ) {
      return false;
    }
    if (
      filter.controlNumber !== undefined &&
      !includes(row.sender.interchangeControlNumber, filter.controlNumber) &&
      !includes(row.receiver.interchangeControlNumber, filter.controlNumber)
    ) {
      return false;
    }
    const exact: readonly [string | undefined, string | undefined][] = [
      [row.id, filter.interchangeId],
      [row.direction, filter.direction],
      [row.processingStatus, filter.processingStatus],
      [row.receiverTechnicalAckStatus, filter.technicalAckStatus],
      [row.receiverFunctionalAckStatus, filter.functionalAckStatus],
    ];
    if (exact.some(([value, wanted]) => wanted !== undefined && value !== wanted)) {
      return false;
    }
    const partial: readonly [string | undefined, string | undefined][] = [
      [row.agreementTypeName, filter.agreementTypeName],
      [row.transactionTypeName, filter.transactionTypeName],
      [row.interchangeName, filter.interchangeName],
    ];
    if (partial.some(([value, wanted]) => wanted !== undefined && !includes(value, wanted))) {
      return false;
    }
    const sides = [row.sender, row.receiver];
    if (
      filter.adapterType !== undefined &&
      !sides.some((side) => side.adapterType === filter.adapterType)
    ) {
      return false;
    }
    const eitherSide: readonly [keyof B2bInterchange["sender"], string | undefined][] = [
      ["systemId", filter.systemId],
      ["groupControlNumber", filter.groupControlNumber],
      ["messageNumber", filter.messageNumber],
    ];
    return eitherSide.every(
      ([field, wanted]) =>
        wanted === undefined || sides.some((side) => includes(side[field], wanted)),
    );
  }
}
