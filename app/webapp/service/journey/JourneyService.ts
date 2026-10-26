import BaseService from "../../core/base/BaseService";
import type { JourneyRef, TransactionJourney } from "./JourneyTypes";

/** Data service for a transaction's journey (`/api/v1/report-server/journey`). */
export default class JourneyService extends BaseService {
  public constructor() {
    super("/api/v1/report-server/journey");
  }

  /** The journey of the transaction the reference names (404 when none matches). */
  public get(ref: JourneyRef, signal?: AbortSignal): Promise<TransactionJourney> {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(ref)) {
      if (typeof value === "string" && value.trim() !== "") {
        query[key] = value.trim();
      }
    }
    return this.client.get<TransactionJourney>(this.path(), { query, signal });
  }
}
