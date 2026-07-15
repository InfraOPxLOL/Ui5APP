import JSONModel from "sap/ui/model/json/JSONModel";
import type { SeverityValue } from "../constants/Severity";

/** One in-app notification. */
export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: SeverityValue;
  readonly timestamp: string;
  read: boolean;
}

/** Shape of the notification model. */
export interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * Global notification model backing the shell's bell popover. The Alert Center wires the live
 * alert feed into this model in a later phase; the model itself (add, mark-read, unread count) is
 * complete now. Capped so a long-running session cannot grow memory unboundedly. Owned by the root
 * component (model name `notifications`).
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class NotificationModel extends JSONModel {
  private static readonly maxItems = 100;

  public constructor() {
    const initial: NotificationState = { items: [], unreadCount: 0 };
    super(initial);
  }

  /**
   * Adds a notification (newest first), evicting the oldest beyond the cap.
   * @param item the notification to add.
   */
  public add(item: NotificationItem): void {
    const items = [item, ...(this.getProperty("/items") as NotificationItem[])].slice(
      0,
      NotificationModel.maxItems,
    );
    this.setProperty("/items", items);
    this.refreshUnreadCount(items);
  }

  /**
   * Marks a single notification as read by id.
   * @param id the notification id.
   */
  public markRead(id: string): void {
    const items = (this.getProperty("/items") as NotificationItem[]).map((item) =>
      item.id === id ? { ...item, read: true } : item,
    );
    this.setProperty("/items", items);
    this.refreshUnreadCount(items);
  }

  /**
   * Removes a single notification by id (dismiss).
   * @param id the notification id.
   */
  public dismiss(id: string): void {
    const items = (this.getProperty("/items") as NotificationItem[]).filter(
      (item) => item.id !== id,
    );
    this.setProperty("/items", items);
    this.refreshUnreadCount(items);
  }

  /**
   * Marks every notification as read (bell popover opened).
   */
  public markAllRead(): void {
    const items = (this.getProperty("/items") as NotificationItem[]).map((item) => ({
      ...item,
      read: true,
    }));
    this.setProperty("/items", items);
    this.refreshUnreadCount(items);
  }

  /**
   * Removes all notifications.
   */
  public clear(): void {
    this.setProperty("/items", []);
    this.setProperty("/unreadCount", 0);
  }

  private refreshUnreadCount(items: readonly NotificationItem[]): void {
    this.setProperty("/unreadCount", items.filter((item) => !item.read).length);
  }
}
