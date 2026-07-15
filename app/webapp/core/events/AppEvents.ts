/**
 * Central declaration of every cross-module event channel and its payload type.
 *
 * Cross-module communication happens **only** through the {@link AppEventBus} using these declared
 * events (architecture §15) — a module reacts to an event, it never imports another module's
 * controller or model. Adding a cross-module signal means adding an entry here first, which keeps
 * the full inter-module contract discoverable in one place and strongly typed.
 */
export const AppEventChannel = {
  Alerts: "alerts",
  Queue: "queue",
  Navigation: "navigation",
  Session: "session",
  Context: "context",
} as const;

export type AppEventChannelName = (typeof AppEventChannel)[keyof typeof AppEventChannel];

/**
 * Map of `"channel:event"` keys to their payload types. The {@link AppEventBus} is generically
 * typed over this map so publish/subscribe calls are checked against the declared payload.
 */
export interface AppEventPayloads {
  "alerts:newCritical": { readonly count: number; readonly latestAlertId: string };
  "queue:purged": { readonly queueName: string; readonly purgedCount: number };
  "navigation:moduleChanged": { readonly moduleId: string };
  "session:tenantChanged": { readonly tenantId: string };
  /** The active workspace changed (workspace navigation). */
  "context:workspaceChanged": { readonly workspaceId: string };
  /** Favorites, pinned actions or recents changed (session-scoped). */
  "context:favoritesChanged": Record<string, never>;
  /**
   * The user context was (re)resolved — after login or a tenant switch — so permission-gated
   * navigation, landing cards and search should re-evaluate. `reason` names the trigger.
   */
  "context:changed": { readonly reason: string };
  /**
   * A well-known shell command was raised from anywhere (a quick action, a card) for the shell
   * chrome to handle — e.g. open the tenant selector, global search or notifications.
   */
  "context:shellCommand": { readonly command: string };
}

/** Union of all valid `"channel:event"` keys. */
export type AppEventKey = keyof AppEventPayloads;
