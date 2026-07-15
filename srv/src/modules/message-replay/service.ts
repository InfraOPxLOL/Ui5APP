import type { MessageReplayDto, ReplayResultDto } from "./dto.js";
import type { PagedResult } from "../../core/http/pagination.js";
import type { PaginationQuery } from "../../core/http/pagination.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";

import { OperationsQueryBuilder } from "../../operations/models/OperationsQuery.js";

/**
 * Service for the Message Replay module. The only layer that talks to CPI (via the shared
 * {@link IntegrationSuiteClient}). It maps raw CPI payloads into the module DTOs so no upstream
 * shape leaks upward. Phase 1 methods return typed placeholder results.
 */
export class MessageReplayService {
  /**
   * Retrieves a server-paginated page of Message Replay rows.
   * @param engine the operations engine
   * @param query validated paging/sorting/filtering parameters.
   * @returns a page of rows.
   */
  public async list(engine: OperationsEngine, query: PaginationQuery = {}): Promise<PagedResult<MessageReplayDto>> {
    const pageSize = query.$top ?? 50;
    const pageNum = Math.floor((query.$skip ?? 0) / pageSize) + 1;
    
    const opQuery = new OperationsQueryBuilder()
      .status("FAILED")
      .page(pageNum)
      .pageSize(pageSize)
      .build();
      
    const page = await engine.message.queryMessages(opQuery);
    
    return {
      items: page.items.map((msg) => ({
        messageId: msg.messageId,
        integrationFlow: msg.integrationFlow,
        status: msg.status,
        failedAt: msg.startTime,
        retryCount: 0 // Not available in general MPL
      })),
      total: page.total,
      skip: query.$skip ?? 0,
      top: pageSize
    };
  }
  /**
   * Executes the replay action.
   * @param engine the operations engine
   * @param messageId the target identifier.
   * @param correlationId the request correlation id.
   * @returns the action result.
   */
  public async replay(_engine: OperationsEngine, messageId: string, correlationId: string): Promise<ReplayResultDto> {
    // OperationsEngine does not support replaying an arbitrary MPL message (only JMS parked messages via RecoveryEngine).
    // Leaving this as a placeholder since it's an old Phase 1 mock module.
    return Promise.resolve({ messageId, accepted: true, correlationId });
  }
}

/** Shared service instance. */
export const messageReplayService = new MessageReplayService();
