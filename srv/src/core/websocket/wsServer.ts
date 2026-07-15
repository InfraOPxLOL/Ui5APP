import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import { logger } from "../logging/logger.js";
import { authorizeUpgrade } from "./wsAuth.js";

/** Message envelope pushed to subscribed clients. */
interface OutboundEnvelope {
  readonly channel: string;
  readonly payload: unknown;
}

/** Control message a client sends to (un)subscribe to a channel. */
interface InboundControl {
  readonly action: "subscribe" | "unsubscribe";
  readonly channel: string;
}

/**
 * Live-monitoring WebSocket server.
 *
 * Maintains a single server bound at `/ws/live` and multiplexes logical channels over each client
 * connection (architecture §13). Modules (e.g. Live Monitoring, Alert Notification) publish to a
 * channel via {@link LiveWebSocketServer.broadcast}; the connections themselves are the only state
 * held, purely in process memory, consistent with the stateless-backend constraint.
 */
export class LiveWebSocketServer {
  private wss: WebSocketServer | undefined;
  private readonly channels = new Map<string, Set<WebSocket>>();

  /**
   * Binds the server to an existing HTTP server.
   * @param server the Node HTTP server.
   */
  public attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws/live" });
    this.wss.on("connection", (socket, request) => {
      const identity = authorizeUpgrade(request);
      if (identity === undefined) {
        socket.close(1008, "Unauthorized");
        return;
      }
      socket.on("message", (data) => this.onControl(socket, data));
      socket.on("close", () => this.removeSocket(socket));
    });
    logger.info("WebSocket server attached at /ws/live");
  }

  /**
   * Broadcasts a payload to every client subscribed to a channel.
   * @param channel the channel name.
   * @param payload the payload to send.
   */
  public broadcast(channel: string, payload: unknown): void {
    const subscribers = this.channels.get(channel);
    if (subscribers === undefined) {
      return;
    }
    const message: OutboundEnvelope = { channel, payload };
    const serialized = JSON.stringify(message);
    for (const socket of subscribers) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  /**
   * Closes the server and clears all subscriptions.
   */
  public close(): void {
    this.channels.clear();
    this.wss?.close();
  }

  private onControl(socket: WebSocket, data: RawData): void {
    let control: InboundControl;
    try {
      control = JSON.parse(data.toString()) as InboundControl;
    } catch {
      return;
    }
    if (control.action === "subscribe") {
      const set = this.channels.get(control.channel) ?? new Set<WebSocket>();
      set.add(socket);
      this.channels.set(control.channel, set);
    } else if (control.action === "unsubscribe") {
      this.channels.get(control.channel)?.delete(socket);
    }
  }

  private removeSocket(socket: WebSocket): void {
    for (const set of this.channels.values()) {
      set.delete(socket);
    }
  }
}

/** Process-wide live WebSocket server instance. */
export const liveWebSocketServer = new LiveWebSocketServer();
