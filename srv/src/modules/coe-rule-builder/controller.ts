import type { Request, Response } from "express";
import { coeRuleBuilderService } from "./service.js";
import type { RuleSaveRequest } from "./dto.js";

/** HTTP handlers for the CoE Visual Rule Builder. Thin: parse request, call the service, shape response. */

/** GET /?pid=…&id=… — reads and decodes one rule. 404 when it does not exist (thrown by the service). */
export async function getRule(req: Request, res: Response): Promise<void> {
  res.json(await coeRuleBuilderService.getRule(req.query.pid as string, req.query.id as string));
}

/** GET /list?pid=… — lists the rules under a registry PID. */
export async function listRules(req: Request, res: Response): Promise<void> {
  const pid = req.query.pid as string;
  res.json(await coeRuleBuilderService.listRules(pid));
}

/** PUT / — creates or updates one rule (body validated by the router). */
export async function saveRule(req: Request, res: Response): Promise<void> {
  const { pid, id, rule } = req.body as RuleSaveRequest;
  res.json(await coeRuleBuilderService.saveRule(pid, id, rule));
}

/** DELETE /?pid=…&id=… — deletes one rule. */
export async function deleteRule(req: Request, res: Response): Promise<void> {
  await coeRuleBuilderService.deleteRule(req.query.pid as string, req.query.id as string);
  res.status(204).end();
}
