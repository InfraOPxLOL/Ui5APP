import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PartnerDirectoryParameterDto } from "../../operations/dto/index.js";
import { JMS_AGREEMENTS_PID, ROUTER_AGREEMENTS_PID } from "../coe-router/dto.js";
import { fromStorageKey, parseRouteKey } from "../coe-router/service.js";
import type {
  DecodedJmsRouteDto,
  DecodedRouterRouteDto,
  OtherParameterDto,
  PartnerDetailDto,
  PartnerListDto,
  PartnerSummaryDto,
  ReferencedByEntryDto,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

const JMS_QUEUE_PREFIX = "QUEUE_JMS_";
const JMS_ENDPOINT_PREFIX = "ROUTE_JMS_";
const JMS_MAPPING_PREFIX = "RCV_JMS_";
const ROUTER_ROUTE_PREFIX = "ROUTE_";

/** Accumulates the pieces of one JMS route as its parameters are found (order in the tenant is not guaranteed). */
interface JmsAccumulator {
  queue: string | undefined;
  endpointUri: string | undefined;
  mappingAddress: string | undefined;
}

/**
 * Aggregation service for the Global Partner Master-Detail Dashboard. Read-only: derives the master
 * list of known partners from the two agreement registries and, per partner, reverse-engineers its
 * raw string parameters into structured routes through `engine.partnerDirectory`. No SDK/OData/CPI
 * shape leaves this layer.
 */
export class CoePartnerDashboardService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Derives the master list: every distinct Partner ID referenced as a target (plain agreement value,
   * or one of a `RULESET_` entry's comma-separated candidates) by either agreement registry.
   * @returns the master list, sorted by Partner ID.
   */
  public async listPartners(): Promise<PartnerListDto> {
    const engine = this.engineFactory();
    const [jms, router] = await Promise.all([
      engine.partnerDirectory.listStringParameters(JMS_AGREEMENTS_PID),
      engine.partnerDirectory.listStringParameters(ROUTER_AGREEMENTS_PID),
    ]);

    const counts = new Map<string, { jms: number; router: number }>();
    const scan = (parameters: readonly PartnerDirectoryParameterDto[], key: "jms" | "router"): void => {
      for (const parameter of parameters) {
        for (const candidate of CoePartnerDashboardService.splitCandidates(parameter.value)) {
          const entry = counts.get(candidate) ?? { jms: 0, router: 0 };
          entry[key] += 1;
          counts.set(candidate, entry);
        }
      }
    };
    scan(jms, "jms");
    scan(router, "router");

    const partners: PartnerSummaryDto[] = [...counts.entries()]
      .map(([pid, count]) => ({
        pid,
        jmsAgreementCount: count.jms,
        routerAgreementCount: count.router,
      }))
      .sort((a, b) => a.pid.localeCompare(b.pid));
    return { partners };
  }

  /**
   * Reverse-engineers one Partner ID's configuration: its route-keyed parameters decoded into
   * structured JMS/Router routes, everything else surfaced as flat "other" parameters, and every
   * agreement entry that routes here (with rule-authored status for ruleset candidates).
   * @param pid the Partner ID to inspect.
   * @returns the full detail view.
   */
  public async getPartnerDetail(pid: string): Promise<PartnerDetailDto> {
    const engine = this.engineFactory();
    const [parameters, jmsAgreements, routerAgreements] = await Promise.all([
      engine.partnerDirectory.listStringParameters(pid),
      engine.partnerDirectory.listStringParameters(JMS_AGREEMENTS_PID),
      engine.partnerDirectory.listStringParameters(ROUTER_AGREEMENTS_PID),
    ]);

    const jmsByStorageKey = new Map<string, JmsAccumulator>();
    const routerByStorageKey = new Map<string, string>();
    const other: OtherParameterDto[] = [];

    for (const parameter of parameters) {
      if (parameter.id.startsWith(JMS_QUEUE_PREFIX)) {
        const key = parameter.id.slice(JMS_QUEUE_PREFIX.length);
        const acc = jmsByStorageKey.get(key) ?? {
          queue: undefined,
          endpointUri: undefined,
          mappingAddress: undefined,
        };
        acc.queue = parameter.value;
        jmsByStorageKey.set(key, acc);
      } else if (parameter.id.startsWith(JMS_ENDPOINT_PREFIX)) {
        const key = parameter.id.slice(JMS_ENDPOINT_PREFIX.length);
        const acc = jmsByStorageKey.get(key) ?? {
          queue: undefined,
          endpointUri: undefined,
          mappingAddress: undefined,
        };
        acc.endpointUri = parameter.value;
        jmsByStorageKey.set(key, acc);
      } else if (parameter.id.startsWith(JMS_MAPPING_PREFIX)) {
        const key = parameter.id.slice(JMS_MAPPING_PREFIX.length);
        const acc = jmsByStorageKey.get(key) ?? {
          queue: undefined,
          endpointUri: undefined,
          mappingAddress: undefined,
        };
        acc.mappingAddress = parameter.value;
        jmsByStorageKey.set(key, acc);
      } else if (parameter.id.startsWith(ROUTER_ROUTE_PREFIX)) {
        const key = parameter.id.slice(ROUTER_ROUTE_PREFIX.length);
        routerByStorageKey.set(key, parameter.value);
      } else {
        other.push({
          id: parameter.id,
          value: parameter.value,
          lastModifiedBy: parameter.lastModifiedBy,
          lastModifiedAt: parameter.lastModifiedAt,
        });
      }
    }

    const jmsRoutes: DecodedJmsRouteDto[] = [...jmsByStorageKey.entries()]
      .map(([storageKey, acc]) => CoePartnerDashboardService.decodeJmsRoute(storageKey, acc))
      .filter((route): route is DecodedJmsRouteDto => route !== undefined)
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));

    const routerRoutes: DecodedRouterRouteDto[] = [...routerByStorageKey.entries()]
      .map(([storageKey, finalTargetPid]) =>
        CoePartnerDashboardService.decodeRouterRoute(storageKey, finalTargetPid),
      )
      .filter((route): route is DecodedRouterRouteDto => route !== undefined)
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));

    const [jmsRefs, routerRefs] = await Promise.all([
      CoePartnerDashboardService.referencedByFrom(engine, jmsAgreements, JMS_AGREEMENTS_PID, pid),
      CoePartnerDashboardService.referencedByFrom(engine, routerAgreements, ROUTER_AGREEMENTS_PID, pid),
    ]);

    return {
      pid,
      jmsRoutes,
      routerRoutes,
      otherParameters: other.sort((a, b) => a.id.localeCompare(b.id)),
      referencedBy: [...jmsRefs, ...routerRefs],
    };
  }

  private static decodeJmsRoute(
    storageKey: string,
    acc: JmsAccumulator,
  ): DecodedJmsRouteDto | undefined {
    const routeKey = fromStorageKey(storageKey);
    const parts = parseRouteKey(routeKey);
    if (parts === undefined) {
      return undefined;
    }
    return { routeKey, ...parts, ...acc };
  }

  private static decodeRouterRoute(
    storageKey: string,
    finalTargetPid: string,
  ): DecodedRouterRouteDto | undefined {
    const routeKey = fromStorageKey(storageKey);
    const parts = parseRouteKey(routeKey);
    if (parts === undefined) {
      return undefined;
    }
    return { routeKey, ...parts, finalTargetPid };
  }

  private static async referencedByFrom(
    engine: OperationsEngine,
    parameters: readonly PartnerDirectoryParameterDto[],
    storePid: string,
    pid: string,
  ): Promise<ReferencedByEntryDto[]> {
    const matches = parameters.filter((parameter) =>
      CoePartnerDashboardService.splitCandidates(parameter.value).includes(pid),
    );
    return Promise.all(
      matches.map(async (parameter) => {
        const isRuleset = parameter.id.startsWith("RULESET_");
        const ruleAuthored = isRuleset
          ? (await engine.partnerDirectory.getBinaryParameter(storePid, pid)) !== undefined
          : undefined;
        return { storePid, id: parameter.id, value: parameter.value, isRuleset, ruleAuthored };
      }),
    );
  }

  private static splitCandidates(value: string): string[] {
    return value
      .split(",")
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate !== "");
  }
}

/** Shared service instance. */
export const coePartnerDashboardService = new CoePartnerDashboardService();
