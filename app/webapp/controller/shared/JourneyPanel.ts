import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type View from "sap/ui/core/mvc/View";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import { getModuleI18nModel } from "../../core/utils/ModuleI18n";
import { DateTimeFormatter } from "../../core/formatters";
import JourneyService from "../../service/journey/JourneyService";
import JourneyFormatter from "../../formatter/journey/JourneyFormatter";
import type {
  JourneyErrorKind,
  JourneyOutcome,
  JourneyRef,
  JourneyStage,
  JourneyStageKind,
  JourneyStageState,
  NextAction,
  NextActionCode,
  TransactionJourney,
} from "../../service/journey/JourneyTypes";

/** State behind the journey fragment, exposed to the host view as the `journey` model. */
export interface JourneyPanelState {
  journey: TransactionJourney | null;
  busy: boolean;
  /** Set when the last load failed (e.g. nothing matched the id). */
  failed: boolean;
}

/** What the panel needs from the screen hosting it. */
export interface JourneyPanelHost {
  navigate(route: string, parameters?: Record<string, unknown>): void;
  handleError(error: unknown): void;
}

/** Journeys kept per screen, so switching between transactions does not trace them again. */
const CACHE_SIZE = 20;

/**
 * Presenter for `fragment/journey/Journey`: one transaction's journey — the stages it passed through
 * (sender, router, JMS framework or TPM, business flow, receiver), where it is now or stuck, the
 * dead-letter queue it is parked on, and the suggested next action with a link to act on it. The
 * Report Server, Failed Transactions and Track Transaction screens host it.
 *
 * The host exposes an instance as its `journey` property; handlers are arrow functions so they keep
 * this instance as `this` when UI5 calls them with the controller as context.
 */
export default class JourneyPanel {
  public readonly model = new JSONModel(JourneyPanel.initialState());

  /** Formatters the fragment binds to as `.journey.fmt.*`. */
  public readonly fmt = {
    dateTime: DateTimeFormatter.formatDateTime,
    stageIcon: (kind?: JourneyStageKind): string => JourneyFormatter.stageIcon(kind),
    stateIcon: (state?: JourneyStageState): string => JourneyFormatter.stateIcon(state),
    stateValue: (state?: JourneyStageState): string => JourneyFormatter.stateValue(state),
    stateText: (stage?: JourneyStage): string => JourneyFormatter.stateText(stage, this.t),
    stageTitle: (kind?: JourneyStageKind): string => JourneyFormatter.stageTitle(kind, this.t),
    stagePrimary: (stage?: JourneyStage): string => JourneyFormatter.stagePrimary(stage, this.t),
    stageSecondary: (stage?: JourneyStage): string =>
      JourneyFormatter.stageSecondary(stage, this.t),
    stageTime: (stage?: JourneyStage): string =>
      DateTimeFormatter.formatDateTime(stage?.endedAt ?? stage?.startedAt ?? undefined),
    runsText: (stage?: JourneyStage): string => JourneyFormatter.runsText(stage, this.t),
    headline: (journey?: TransactionJourney | null): string =>
      JourneyFormatter.headline(journey, this.t),
    subline: (journey?: TransactionJourney | null): string =>
      JourneyFormatter.subline(journey, this.t),
    timing: (journey?: TransactionJourney | null): string => {
      if (!journey) {
        return "";
      }
      const started = journey.startedAt
        ? this.t("started", [DateTimeFormatter.formatDateTime(journey.startedAt)])
        : "";
      const last = journey.lastActivityAt
        ? this.t("lastActivity", [
            DateTimeFormatter.formatDateTime(journey.lastActivityAt),
            JourneyFormatter.elapsed(journey.lastActivityAt),
          ])
        : "";
      return [started, last].filter((part) => part !== "").join(" · ");
    },
    outcomeIcon: (outcome?: JourneyOutcome): string => JourneyFormatter.outcomeIcon(outcome),
    outcomeType: (outcome?: JourneyOutcome): string => JourneyFormatter.outcomeType(outcome),
    errorKindText: (kind?: JourneyErrorKind | null): string =>
      JourneyFormatter.errorKindText(kind ?? undefined, this.t),
    diagnosisNote: (journey?: TransactionJourney | null): string => {
      const diagnosis = journey?.diagnosis;
      if (diagnosis === undefined) {
        return "";
      }
      if (diagnosis.outcome === "completed") {
        return this.t("diagnosis.completed");
      }
      if (diagnosis.overdue) {
        return this.t("diagnosis.overdue", [JourneyFormatter.elapsed(journey?.lastActivityAt)]);
      }
      if (diagnosis.outcome === "inProgress") {
        return this.t("diagnosis.inProgress");
      }
      if (!diagnosis.errorText) {
        return this.t("diagnosis.noError");
      }
      return diagnosis.failedRuns > 1 ? this.t("diagnosis.failedRuns", [diagnosis.failedRuns]) : "";
    },
    parkedSince: (stage?: JourneyStage): string =>
      stage?.parked
        ? this.t("parked.since", [
            DateTimeFormatter.formatDateTime(stage.parked.parkedAt),
            JourneyFormatter.elapsed(stage.parked.parkedAt),
          ])
        : "",
    parkedRetry: (stage?: JourneyStage): string =>
      !stage?.parked
        ? ""
        : stage.parked.retryTarget
          ? this.t("parked.retryTo", [stage.parked.retryTarget])
          : this.t("parked.retryChoose"),
    parkedRedelivered: (count?: number): string =>
      count === undefined || count === null ? "" : this.t("parked.redelivered", [count]),
    actionIcon: (code?: NextActionCode): string => JourneyFormatter.actionIcon(code),
    actionTitle: (action?: NextAction): string =>
      JourneyFormatter.actionTitle(action, this.current()?.category, this.t),
    actionText: (action?: NextAction): string =>
      JourneyFormatter.actionText(action, this.current(), this.t),
    actionLinkText: (action?: NextAction): string => {
      const link = JourneyFormatter.actionLink(action, this.current());
      return link === undefined ? "" : this.t(link.labelKey);
    },
    hasActionLink: (action?: NextAction): boolean =>
      JourneyFormatter.actionLink(action, this.current()) !== undefined,
  };

  private readonly service = new JourneyService();
  private readonly bundle = getModuleI18nModel("journey").getResourceBundle() as ResourceBundle;
  private readonly cache = new Map<string, TransactionJourney>();
  private ref: JourneyRef | undefined;
  private loadSequence = 0;

  public constructor(private readonly host: JourneyPanelHost) {}

  /** Attaches the `journey` model and `journeyI18n` bundle the fragment binds to. */
  public attach(view: View): void {
    view.setModel(this.model, "journey");
    view.setModel(getModuleI18nModel("journey"), "journeyI18n");
  }

  /**
   * Shows a transaction's journey — from the cache when it was traced before, else traced now.
   * `undefined` empties the panel.
   */
  public show(ref: JourneyRef | undefined): Promise<TransactionJourney | undefined> {
    this.ref = ref;
    if (ref === undefined) {
      this.clear();
      return Promise.resolve(undefined);
    }
    const cached = this.cache.get(JourneyPanel.key(ref));
    if (cached !== undefined) {
      this.loadSequence += 1;
      this.model.setData({ journey: cached, busy: false, failed: false });
      return Promise.resolve(cached);
    }
    return this.load(ref);
  }

  /** Traces the shown transaction again, ignoring the cache. */
  public readonly onRefresh = (): void => {
    if (this.ref !== undefined) {
      void this.load(this.ref);
    }
  };

  /** Empties the panel. */
  public clear(): void {
    this.loadSequence += 1;
    this.model.setData(JourneyPanel.initialState());
  }

  /** Opens what a suggested action points at (Failed Transactions, Partners & Routes, a log). */
  public readonly onActionPress = (event: Event): void => {
    const action = JourneyPanel.contextObject<NextAction>(event);
    const link = JourneyFormatter.actionLink(action, this.current());
    if (link !== undefined) {
      this.host.navigate(link.route, link.parameters);
    }
  };

  /** Opens a stage's latest processing log in the Message Monitoring drill-down. */
  public readonly onOpenStageLog = (event: Event): void => {
    const mplId = JourneyPanel.contextObject<JourneyStage>(event)?.mplIds.at(-1);
    if (mplId !== undefined) {
      this.host.navigate("messageMonitoring", { mplId });
    }
  };

  private async load(ref: JourneyRef): Promise<TransactionJourney | undefined> {
    const sequence = ++this.loadSequence;
    this.model.setData({ journey: null, busy: true, failed: false });
    try {
      const journey = await this.service.get(ref);
      this.remember(ref, journey);
      if (sequence === this.loadSequence) {
        this.model.setData({ journey, busy: false, failed: false });
      }
      return journey;
    } catch (error) {
      if (sequence === this.loadSequence) {
        this.model.setData({ journey: null, busy: false, failed: true });
        // A transaction that cannot be traced is shown in the panel; anything else is an error.
        if ((error as { code?: string } | undefined)?.code !== "NOT_FOUND") {
          this.host.handleError(error);
        }
      }
      return undefined;
    }
  }

  private remember(ref: JourneyRef, journey: TransactionJourney): void {
    this.cache.delete(JourneyPanel.key(ref));
    this.cache.set(JourneyPanel.key(ref), journey);
    while (this.cache.size > CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
  }

  private current(): TransactionJourney | null {
    return this.model.getProperty("/journey") as TransactionJourney | null;
  }

  private readonly t = (key: string, args?: (string | number)[]): string =>
    this.bundle.getText(key, args) ?? key;

  private static key(ref: JourneyRef): string {
    return JSON.stringify([ref.id, ref.correlationId, ref.mplId, ref.interchangeId]);
  }

  private static contextObject<T>(event: Event): T | undefined {
    const source = event.getSource() as unknown as {
      getBindingContext(name: string): { getObject(): unknown } | null | undefined;
    };
    return source.getBindingContext("journey")?.getObject() as T | undefined;
  }

  private static initialState(): JourneyPanelState {
    return { journey: null, busy: false, failed: false };
  }
}
