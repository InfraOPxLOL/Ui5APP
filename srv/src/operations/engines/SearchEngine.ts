import type { MessageEngine } from "./MessageEngine.js";
import type { QueueEngine } from "./QueueEngine.js";
import type { CertificateEngine } from "./CertificateEngine.js";
import type { MessageDetails, MessageSummary } from "../dto/MessageDto.js";
import type { QueueSummary } from "../dto/QueueDto.js";
import type { CertificateSummary } from "../dto/CertificateDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import type { OperationsQuery } from "../models/index.js";

/**
 * The universal search facade (architecture: Phase 6, Search Engine, §3). Composes the domain
 * engines that already know how to fetch and filter their own data — `SearchEngine` adds no fetching
 * logic of its own, only the cross-domain entry points a search box needs (search by field-rich
 * query for messages; by id for exact lookups; by substring for queues/certificates). Every method
 * returns Operations DTOs only — no SDK object ever escapes through here.
 */
export class SearchEngine {
  public constructor(
    private readonly messageEngine: MessageEngine,
    private readonly queueEngine: QueueEngine,
    private readonly certificateEngine: CertificateEngine,
  ) {}

  /** Searches messages by the full field-rich {@link OperationsQuery} (status, sender, receiver, message type, custom status, application id, integration flow, date range, duration, free-text). */
  public async searchMessages(query: OperationsQuery): Promise<SearchResult<MessageSummary>> {
    return this.messageEngine.queryMessages(query);
  }

  /** Finds one message by its exact id (also its MPL id — the two are the same value in this domain). */
  public async findMessageById(messageId: string): Promise<MessageDetails | undefined> {
    return this.messageEngine.getMessage(messageId);
  }

  /** Finds every message sharing a correlation id. */
  public async findMessagesByCorrelationId(
    correlationId: string,
  ): Promise<readonly MessageSummary[]> {
    return this.messageEngine.findByCorrelationId(correlationId);
  }

  /** Searches queues by name/display-name substring (case-insensitive). */
  public async searchQueues(term: string): Promise<readonly QueueSummary[]> {
    const needle = term.toLowerCase();
    const queues = await this.queueEngine.listQueues();
    return queues.filter(
      (queue) =>
        queue.queueName.toLowerCase().includes(needle) ||
        queue.displayName.toLowerCase().includes(needle),
    );
  }

  /** Searches certificates by alias substring (case-insensitive). */
  public async searchCertificates(term: string): Promise<readonly CertificateSummary[]> {
    return this.certificateEngine.search({ alias: term });
  }
}
