import type { Request, Response, NextFunction } from "express";
import { createOperationsEngine } from "../../config/operationsEngineFactory.js";

/**
 * Middleware that instantiates the Operations Engine per request and attaches it to the request object.
 * This ensures that each request has its own engine instance with a request-scoped cache.
 */
export function operationsEngineMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Real vs. mock *providers* are selected by connectivity.json, not this flag — this only controls
  // the shared MockEngine that always backs apiManagement/designTime regardless of provider mode.
  // Matches the value every other module's own engineFactory uses (e.g. operations/service.ts's
  // OVERVIEW_MOCK_CONFIG) so a request-scoped engine behaves identically everywhere it's built.
  const mockEngineConfig = {
    enabled: true,
    defaultScenario: "success" as const,
  };

  req.operationsEngine = createOperationsEngine(mockEngineConfig);
  next();
}
