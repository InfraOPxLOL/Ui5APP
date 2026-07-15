import { createServer, type Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { configService } from "./config/ConfigService.js";
import { logger } from "./core/logging/logger.js";
import { liveWebSocketServer } from "./core/websocket/wsServer.js";
import { scheduler } from "./core/jobs/scheduler.js";

/**
 * Process entry point.
 *
 * Boots the Express app, attaches the live-monitoring WebSocket server to the same HTTP server,
 * starts listening, and installs graceful-shutdown handlers. Importing {@link configService} here
 * ensures every configuration file is loaded and validated (and the process fails fast) before the
 * server begins accepting traffic.
 */
function start(): void {
  const app = createApp();
  const server: Server = createServer(app);

  liveWebSocketServer.attach(server);

  server.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        env: env.nodeEnv,
        configEnv: configService.getEnvironment().name,
        app: configService.getApplication().id,
      },
      "Integration Portal backend started",
    );
  });

  installShutdownHandlers(server);
}

function installShutdownHandlers(server: Server): void {
  const shutdown = (signal: string): void => {
    logger.info({ signal }, "Shutting down");
    scheduler.stopAll();
    liveWebSocketServer.close();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
