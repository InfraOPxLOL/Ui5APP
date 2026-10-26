import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import BaseController from "../../core/base/BaseController";
import { RouteNames } from "../../core/constants/RouteNames";
import JourneyPanel from "../shared/JourneyPanel";

/** IDs looked up recently, newest first (per browser). */
const RECENT_KEY = "integrationPortal.trackTransaction.recent";
const RECENT_SIZE = 6;

interface TrackTransactionState {
  query: string;
  recent: string[];
}

/**
 * Track Transaction: paste any id a business user has — a correlation id, a processing log (MPL) id
 * or a B2B interchange id — and see the transaction's journey: every stage it passed through, where
 * it is now or stuck, and the next best action. The id lives in the route (`#/trackTransaction/<id>`)
 * so a traced transaction can be shared as a link.
 *
 * @namespace com.middlewareops.integrationportal.controller.trackTransaction
 */
export default class TrackTransactionController extends BaseController {
  /** The shared journey presenter the fragment binds to as `.journey.*`. */
  public readonly journey = new JourneyPanel({
    navigate: (route, parameters) => this.getRouter().navTo(route, parameters),
    handleError: (error) => this.getErrorHandler().handle(error),
  });

  /** The id the route last traced. */
  private tracedId = "";

  public onInit(): void {
    const state: TrackTransactionState = { query: "", recent: TrackTransactionController.readRecent() };
    this.setModel(new JSONModel(state), "view");
    this.journey.attach(this.getView()!);
    this.getRouter()
      .getRoute(RouteNames.TrackTransaction)
      ?.attachPatternMatched((event: Event) => {
        const args = (event.getParameter("arguments" as never) ?? {}) as { id?: string };
        const id = (args.id ?? "").trim();
        this.model().setProperty("/query", id);
        void this.trace(id);
      });
  }

  /** Looks the typed id up. The route carries it, so the result can be shared as a link. */
  public onSearch(): void {
    const id = String(this.model().getProperty("/query") ?? "").trim();
    if (id === "") {
      this.journey.clear();
      return;
    }
    // The route already shows this id, so navigating would not trace it again.
    if (id === this.tracedId) {
      this.journey.onRefresh();
      return;
    }
    this.getRouter().navTo(RouteNames.TrackTransaction, { id });
  }

  /** Traces one of the recently looked-up ids again. */
  public onRecentPress(event: Event): void {
    const id = (event.getSource() as unknown as { getText(): string }).getText();
    if (id !== "") {
      this.getRouter().navTo(RouteNames.TrackTransaction, { id });
    }
  }

  private async trace(id: string): Promise<void> {
    this.tracedId = id;
    if (id === "") {
      this.journey.clear();
      return;
    }
    const journey = await this.journey.show({ id });
    if (journey !== undefined) {
      this.remember(id);
    }
  }

  private remember(id: string): void {
    const recent = [id, ...TrackTransactionController.readRecent().filter((entry) => entry !== id)]
      .slice(0, RECENT_SIZE);
    this.model().setProperty("/recent", recent);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Storage unavailable (private window, blocked site data): the list lives for this visit only.
    }
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private static readRecent(): string[] {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, RECENT_SIZE)
        : [];
    } catch {
      return [];
    }
  }
}
