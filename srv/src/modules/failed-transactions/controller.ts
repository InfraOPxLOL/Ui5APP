import type { Request, Response } from "express";
import { failedTransactionsService } from "./service.js";

/** HTTP handlers for Failed Transactions. Thin: parse, call the service, respond. */

/** GET / — messages on the TPM dead-letter queues. */
export async function list(req: Request, res: Response): Promise<void> {
  const q = req.query as Record<string, string | undefined>;
  res.json(
    await failedTransactionsService.list({
      queue: q.queue,
      search: q.search,
      page: q.page === undefined ? undefined : Number(q.page),
      pageSize: q.pageSize === undefined ? undefined : Number(q.pageSize),
    }),
  );
}

/** GET /:messageId?queue= — one message with recovery path, retry history and interchange. */
export async function getDetail(req: Request, res: Response): Promise<void> {
  const q = req.query as Record<string, string>;
  res.json(
    await failedTransactionsService.getDetail(req.params.messageId as string, q.queue as string),
  );
}

/** GET /:messageId/payload?queue= — the parked message's body, read from the broker. */
export async function getPayload(req: Request, res: Response): Promise<void> {
  const q = req.query as Record<string, string>;
  res.json(
    await failedTransactionsService.getPayload(req.params.messageId as string, q.queue as string),
  );
}

/** POST /:messageId/retry — move back to the mapped main queue, verify, retry. */
export async function retry(req: Request, res: Response): Promise<void> {
  const body = req.body as { queueName: string; reason?: string };
  res.json(
    await failedTransactionsService.retry(
      req.params.messageId as string,
      body.queueName,
      body.reason,
    ),
  );
}

/** POST /retry — retry several messages. */
export async function retryMany(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    items: readonly { messageId: string; queueName: string }[];
    reason?: string;
  };
  res.json(await failedTransactionsService.retryMany(body.items, body.reason));
}
