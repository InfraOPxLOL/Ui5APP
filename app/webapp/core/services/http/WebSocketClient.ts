/**
 * Callback invoked with each decoded message on a subscribed channel.
 */
export type WebSocketMessageHandler<T> = (payload: T) => void;

/** Envelope shape exchanged over the live-monitoring WebSocket. */
interface WebSocketEnvelope {
  readonly channel: string;
  readonly payload: unknown;
}

/**
 * Single shared WebSocket connection for the whole session (architecture §13).
 *
 * Views subscribe/unsubscribe to logical channels on this one connection rather than each opening
 * their own socket. The client handles connect, channel multiplexing, and automatic reconnect with
 * backoff. It is transport only — it knows nothing about the domain payloads, which subscribers
 * type themselves.
 */
export default class WebSocketClient {
  private static instance: WebSocketClient | undefined;
  private socket: WebSocket | undefined;
  private readonly url: string;
  private readonly handlers = new Map<string, Set<WebSocketMessageHandler<unknown>>>();
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 30000;
  private closedByClient = false;

  private constructor() {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    this.url = `${scheme}://${window.location.host}/ws/live`;
  }

  /**
   * @returns the process-wide singleton WebSocket client.
   */
  public static getInstance(): WebSocketClient {
    WebSocketClient.instance ??= new WebSocketClient();
    return WebSocketClient.instance;
  }

  /**
   * Opens the connection if not already open. Idempotent.
   */
  public connect(): void {
    if (this.socket !== undefined && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    this.closedByClient = false;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event: MessageEvent<string>) =>
      this.dispatch(event.data),
    );
    this.socket.addEventListener("open", () => {
      this.reconnectDelayMs = 1000;
    });
    this.socket.addEventListener("close", () => this.scheduleReconnect());
  }

  /**
   * Subscribes a handler to a channel, connecting lazily if needed.
   * @param channel the logical channel name.
   * @param handler invoked with each payload on that channel.
   * @returns an unsubscribe function.
   */
  public subscribe<T>(channel: string, handler: WebSocketMessageHandler<T>): () => void {
    this.connect();
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler as WebSocketMessageHandler<unknown>);
    this.handlers.set(channel, set);
    return () => this.unsubscribe(channel, handler as WebSocketMessageHandler<unknown>);
  }

  private unsubscribe(channel: string, handler: WebSocketMessageHandler<unknown>): void {
    const set = this.handlers.get(channel);
    set?.delete(handler);
    if (set !== undefined && set.size === 0) {
      this.handlers.delete(channel);
    }
  }

  /**
   * Closes the connection and clears all subscriptions.
   */
  public disconnect(): void {
    this.closedByClient = true;
    this.handlers.clear();
    this.socket?.close();
    this.socket = undefined;
  }

  private dispatch(raw: string): void {
    let envelope: WebSocketEnvelope;
    try {
      envelope = JSON.parse(raw) as WebSocketEnvelope;
    } catch {
      return;
    }
    const set = this.handlers.get(envelope.channel);
    set?.forEach((handler) => handler(envelope.payload));
  }

  private scheduleReconnect(): void {
    if (this.closedByClient || this.handlers.size === 0) {
      return;
    }
    window.setTimeout(() => this.connect(), this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
  }
}
