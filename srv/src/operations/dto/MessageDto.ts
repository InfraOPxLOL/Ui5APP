import type { Severity } from "../transform/index.js";
import type { MessageErrorDetail } from "../../core/providers/types.js";

/**
 * The business-friendly, list-shaped view of one message processing log — the only message shape
 * the Operations Engine ever hands back (architecture: Phase 6, DTO Layer, §14). Every field a
 * message-list UI needs is already present and already enriched (`humanReadableStatus`, `severity`);
 * no SDK/core domain type ever needs to escape past `MessageEngine`.
 */
export interface MessageSummary {
  readonly messageId: string;
  readonly correlationId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: Severity;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly processingTimeMs: number | undefined;
  readonly processingTimeHuman: string;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId: string | undefined;
  readonly messageType: string | undefined;
  readonly customStatus: string | undefined;
}

/**
 * The full single-message view (`MessageEngine.getMessage`). Extends {@link MessageSummary} with the
 * MPL id (an alias of `messageId` in this domain — SAP Integration Suite's `MessageGuid` *is* the MPL
 * id), the message's error details when it failed, and its SAP-standard/custom header split.
 *
 * `sapStandardHeaders`/`customHeaders` default to `{}`: no `core/providers` contract yet exposes
 * message-level header retrieval (Phase 3's `MessageProcessingLog` domain type carries no headers
 * bag). `HeaderEngine` is ready to categorize them the moment that data exists — this is a
 * documented seam, not a bug, matching how the SDK itself documents its own future extension points.
 */
export interface MessageDetails extends MessageSummary {
  readonly mplId: string;
  readonly errorDetails: readonly MessageErrorDetail[];
  readonly sapStandardHeaders: Readonly<Record<string, string>>;
  readonly customHeaders: Readonly<Record<string, string>>;
}
