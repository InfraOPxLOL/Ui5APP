import type { IAlertProvider } from "../../core/providers/IAlertProvider.js";
import type {
  AlertEvent,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { IAuthProvider } from "../auth/IAuthProvider.js";
import { SdkRestClient } from "../rest/SdkRestClient.js";
import { createOperationContext, type OperationContext } from "../models/OperationContext.js";
import { createRequestContext } from "../models/RequestContext.js";
import { HttpError } from "../../core/errors/HttpError.js";

/**
 * Connection details for the **SAP Alert Notification Service** (ANS) — a distinct BTP service
 * instance from Integration Suite itself, with its own base URL and its own OAuth client. Injected
 * directly (rather than resolved through the CPI {@link IDestinationResolver}) because an ANS
 * instance is not "a tenant" in this SDK's destination vocabulary; it is one shared alert source a
 * tenant's alerts may be relayed through.
 */
export interface AlertNotificationServiceConfig {
  /** ANS instance base URL (e.g. `https://<instance>.notification.<region>.hana.ondemand.com`). */
  readonly baseUrl: string;
  /** Auth provider for the ANS instance's own OAuth client. */
  readonly authProvider: IAuthProvider;
}

/** Raw shape of one ANS consumer-API alert. */
interface AnsAlert {
  readonly id: string;
  readonly severity?: string;
  readonly category?: string;
  readonly subject?: string;
  readonly body?: string;
  readonly resource?: { readonly resourceName?: string };
  readonly eventTime?: string;
  readonly tags?: Readonly<Record<string, string>>;
}

/** Raw shape of the ANS consumer API's alert list response. */
interface AnsAlertListResponse {
  readonly alerts: readonly AnsAlert[];
  readonly totalHits?: number;
}

/**
 * Live implementation of {@link IAlertProvider}, backed by the SAP Alert Notification Service's
 * documented consumer REST API (architecture: Alert Provider, §11 — "Alert Notification retrieval").
 * Reads via {@link SdkRestClient} directly (JSON REST, not OData) rather than the pipeline/
 * destination-resolver seam the CPI-tenant providers use, per {@link AlertNotificationServiceConfig}'s
 * doc comment. When {@link AlertNotificationServiceConfig} is not configured, the SDK composition
 * root simply does not construct this provider — the platform's local alert sweeps remain the only
 * source, matching {@link IAlertProvider}'s "implementations may fan in multiple sources" contract.
 */
export class RealAlertProvider implements IAlertProvider {
  private readonly restClient: SdkRestClient;

  public constructor(
    httpClient: IHttpClient,
    private readonly ans: AlertNotificationServiceConfig,
  ) {
    this.restClient = new SdkRestClient(httpClient);
  }

  /** @inheritdoc */
  public async queryAlerts(
    context: ProviderContext,
    page: ProviderPage,
    severity?: string,
  ): Promise<ProviderPagedResult<AlertEvent>> {
    const opContext = this.buildContext(context, "alert.queryAlerts");
    const authHeaders = await this.ans.authProvider.getAuthHeaders({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
    });
    const pageSize = Math.max(page.top, 1);
    const response = await this.restClient.get<AnsAlertListResponse>(
      `${this.ans.baseUrl}/api/v1/consumer/alerts`,
      opContext,
      {
        headers: authHeaders,
        query: {
          pageSize,
          pageNum: Math.floor(page.skip / pageSize) + 1,
          ...(severity !== undefined ? { severity } : {}),
        },
      },
    );
    const alerts = response.data.alerts ?? [];
    return {
      items: alerts.map(RealAlertProvider.toDomain),
      total: response.data.totalHits ?? alerts.length,
    };
  }

  /** @inheritdoc */
  public async getAlert(
    context: ProviderContext,
    alertId: string,
  ): Promise<AlertEvent | undefined> {
    const opContext = this.buildContext(context, "alert.getAlert");
    const authHeaders = await this.ans.authProvider.getAuthHeaders({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
    });
    try {
      const response = await this.restClient.get<AnsAlert>(
        `${this.ans.baseUrl}/api/v1/consumer/alerts/${encodeURIComponent(alertId)}`,
        opContext,
        { headers: authHeaders },
      );
      return RealAlertProvider.toDomain(response.data);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  private buildContext(context: ProviderContext, operationName: string): OperationContext {
    return createOperationContext(
      createRequestContext(context.tenantId, { correlationId: context.correlationId }),
      operationName,
    );
  }

  private static toDomain(raw: AnsAlert): AlertEvent {
    return {
      alertId: raw.id,
      severity: raw.severity ?? "INFO",
      title: raw.subject ?? "",
      description: raw.body ?? "",
      source: raw.resource?.resourceName ?? "SAP Alert Notification Service",
      raisedAt: raw.eventTime ?? new Date().toISOString(),
      tags:
        raw.tags !== undefined
          ? Object.entries(raw.tags).map(([key, value]) => `${key}=${value}`)
          : [],
    };
  }
}
