import NotificationModel, { type NotificationItem } from "../../core/models/NotificationModel";
import { Severity, type SeverityValue } from "../../core/constants/Severity";

/**
 * The severity categories the notification center supports (§13). Aliased to the shared
 * {@link SeverityValue} so notifications colour-map identically to alerts and health elsewhere.
 */
export type NotificationCategory = SeverityValue;

/** A request to raise a notification. Id and timestamp are assigned by the center. */
export interface NotificationInput {
  readonly title: string;
  readonly description: string;
  readonly category: NotificationCategory;
}

/**
 * The reusable notification center (§13). Framework only — it owns notification lifecycle (raise,
 * mark-read, dismiss, clear), unread counting, severity filtering and history, over the frozen
 * global {@link NotificationModel} that backs the shell bell. It is deliberately empty of content:
 * the future Alert Notification integration simply calls {@link notify} to feed live alerts in, and
 * every existing binding lights up with no further wiring.
 */
export default class NotificationCenter {
  private static instance: NotificationCenter | undefined;
  private model: NotificationModel | undefined;
  private sequence = 0;

  private constructor() {
    // Singleton — use NotificationCenter.getInstance().
  }

  /**
   * @returns the process-wide singleton notification center.
   */
  public static getInstance(): NotificationCenter {
    NotificationCenter.instance ??= new NotificationCenter();
    return NotificationCenter.instance;
  }

  /**
   * Binds the center to the global notification model. Called once during bootstrap.
   * @param model the global notification model bound to the shell bell.
   */
  public initialize(model: NotificationModel): void {
    this.model = model;
  }

  /**
   * Raises a notification.
   * @param input the notification content and category.
   * @returns the id assigned to the new notification.
   */
  public notify(input: NotificationInput): string {
    const id = `ntf-${(++this.sequence).toString()}`;
    const item: NotificationItem = {
      id,
      title: input.title,
      description: input.description,
      severity: input.category,
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.requireModel().add(item);
    return id;
  }

  /** Raises an informational notification. @returns the new notification id. */
  public info(title: string, description: string): string {
    return this.notify({ title, description, category: Severity.Info });
  }

  /** Raises a warning notification. @returns the new notification id. */
  public warning(title: string, description: string): string {
    return this.notify({ title, description, category: Severity.Warning });
  }

  /** Raises an error notification. @returns the new notification id. */
  public error(title: string, description: string): string {
    return this.notify({ title, description, category: Severity.Error });
  }

  /** Raises a critical notification. @returns the new notification id. */
  public critical(title: string, description: string): string {
    return this.notify({ title, description, category: Severity.Critical });
  }

  /**
   * @returns the number of unread notifications.
   */
  public getUnreadCount(): number {
    return this.requireModel().getProperty("/unreadCount") as number;
  }

  /**
   * @returns the full notification history, newest first.
   */
  public getHistory(): readonly NotificationItem[] {
    return this.requireModel().getProperty("/items") as readonly NotificationItem[];
  }

  /**
   * Filters the history by category.
   * @param category the severity category to keep.
   * @returns the matching notifications, newest first.
   */
  public filterByCategory(category: NotificationCategory): readonly NotificationItem[] {
    return this.getHistory().filter((item) => item.severity === category);
  }

  /**
   * Marks a single notification read.
   * @param id the notification id.
   */
  public markRead(id: string): void {
    this.requireModel().markRead(id);
  }

  /** Marks every notification read. */
  public markAllRead(): void {
    this.requireModel().markAllRead();
  }

  /**
   * Dismisses (removes) a single notification.
   * @param id the notification id.
   */
  public dismiss(id: string): void {
    this.requireModel().dismiss(id);
  }

  /** Clears all notifications. */
  public clear(): void {
    this.requireModel().clear();
  }

  private requireModel(): NotificationModel {
    if (this.model === undefined) {
      throw new Error("NotificationCenter.initialize() must be called before use.");
    }
    return this.model;
  }
}
