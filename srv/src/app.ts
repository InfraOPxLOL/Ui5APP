import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { configService } from "./config/ConfigService.js";
import { correlationIdMiddleware } from "./core/middleware/correlationId.middleware.js";
import { requestLoggerMiddleware } from "./core/middleware/requestLogger.middleware.js";
import { authMiddleware } from "./core/middleware/auth.middleware.js";
import { operationsEngineMiddleware } from "./core/middleware/operationsEngine.middleware.js";
import { rateLimiter } from "./core/middleware/rateLimiter.middleware.js";
import { errorHandlerMiddleware } from "./core/middleware/errorHandler.middleware.js";
import { apiRouter } from "./routes/index.js";

// Side-effect import: registers the Express request augmentation (correlationId, log, security).
import "./core/http/context.js";

/**
 * Builds and configures the Express application with the canonical middleware order:
 * security headers → CORS → compression → body parsing → correlation id → request logging →
 * authentication → operations engine → rate limiting → API routes → terminal error handler.
 *
 * The app is transport-agnostic (no `listen`) so it can be unit-tested and wrapped by the HTTP
 * server in {@link server}.
 * @returns the configured Express application.
 */
export function createApp(): Express {
  const app = express();
  const security = configService.getSecurity();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors(
      security.cors.allowedOrigins.length > 0
        ? { origin: [...security.cors.allowedOrigins] }
        : configService.getEnvironment().kind === "development"
          ? undefined // dev: reflect any origin for local tooling
          : { origin: false }, // deployed same-origin (approuter): no cross-origin access
    ),
  );
  app.use(compression());
  app.use(express.json({ limit: `${security.requestBodyLimitKb}kb` }));

  // Liveness/readiness probe for Cloud Foundry — must not require auth.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "UP" });
  });

  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(authMiddleware);
  app.use(operationsEngineMiddleware);
  app.use(
    rateLimiter({ windowMs: security.rateLimit.windowMs, max: security.rateLimit.maxRequests }),
  );

  app.use("/api/v1", apiRouter);

  // Terminal error handler — must be registered last.
  app.use(errorHandlerMiddleware);

  return app;
}
