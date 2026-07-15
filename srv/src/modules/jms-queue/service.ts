import type { JmsQueueDto, PurgeResultDto } from "./dto.js";
import type { PagedResult } from "../../core/http/pagination.js";
import type { PaginationQuery } from "../../core/http/pagination.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";

/**
 * Service for the JMS Queues module. The only layer that talks to CPI (via the shared
 * {@link IntegrationSuiteClient}). It maps raw CPI payloads into the module DTOs so no upstream
 * shape leaks upward. Phase 1 methods return typed placeholder results.
 */
export class JmsQueueService {
  /**
   * Retrieves a server-paginated page of JMS Queues rows.
   * @param engine the operations engine
   * @param query validated paging/sorting/filtering parameters.
   * @returns a page of rows.
   */
  public async list(engine: OperationsEngine, query: PaginationQuery = {}): Promise<PagedResult<JmsQueueDto>> {
    const queues = await engine.queue.listQueues();
    // Simulate pagination for now since OperationsEngine.queue.listQueues returns all queues.
    const skip = query.$skip ?? 0;
    const top = query.$top ?? 50;
    const items = queues.slice(skip, skip + top);
    return {
      items,
      total: queues.length,
      skip,
      top
    };
  }
  /**
   * Executes the purge action.
   * @param engine the operations engine
   * @param queueName the target identifier.
   * @param _correlationId the request correlation id.
   * @returns the action result.
   */
  public async purge(engine: OperationsEngine, queueName: string, _correlationId: string): Promise<PurgeResultDto> {
    const purgedCount = await engine.queue.purgeQueue(queueName);
    return { queueName, purgedCount };
  }
}

/** Shared service instance. */
export const jmsQueueService = new JmsQueueService();
