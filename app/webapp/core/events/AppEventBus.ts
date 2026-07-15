import EventBus from "sap/ui/core/EventBus";
import { AppEventChannel, type AppEventKey, type AppEventPayloads } from "./AppEvents";

/**
 * Strongly-typed façade over the singleton {@link sap.ui.core.EventBus}.
 *
 * Publish/subscribe are keyed by the `"channel:event"` keys declared in {@link AppEventPayloads},
 * and payloads are checked against that declaration at compile time — eliminating the stringly-typed
 * channel/event/data triple of the raw EventBus. This is the only sanctioned cross-module
 * communication mechanism (architecture §15).
 */
export default class AppEventBus {
  private static instance: AppEventBus | undefined;
  private readonly bus: EventBus = EventBus.getInstance();

  private constructor() {
    // Singleton — use AppEventBus.getInstance().
  }

  /**
   * @returns the process-wide singleton event bus façade.
   */
  public static getInstance(): AppEventBus {
    AppEventBus.instance ??= new AppEventBus();
    return AppEventBus.instance;
  }

  /**
   * Publishes a typed event.
   * @param key the `"channel:event"` key.
   * @param payload the payload, whose type is derived from {@link AppEventPayloads}.
   */
  public publish<K extends AppEventKey>(key: K, payload: AppEventPayloads[K]): void {
    const { channel, event } = AppEventBus.split(key);
    this.bus.publish(channel, event, payload as object);
  }

  /**
   * Subscribes to a typed event.
   * @param key the `"channel:event"` key.
   * @param handler invoked with the typed payload on each publish.
   * @param listener optional `this` context for the handler.
   */
  public subscribe<K extends AppEventKey>(
    key: K,
    handler: (payload: AppEventPayloads[K]) => void,
    listener?: object,
  ): void {
    const { channel, event } = AppEventBus.split(key);
    this.bus.subscribe(
      channel,
      event,
      (_channel: string, _event: string, data: object) => handler(data as AppEventPayloads[K]),
      listener,
    );
  }

  private static split(key: AppEventKey): { channel: string; event: string } {
    const [channel, event] = key.split(":");
    return { channel: channel ?? AppEventChannel.Navigation, event: event ?? "" };
  }
}
