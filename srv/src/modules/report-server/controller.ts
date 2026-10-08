import type { Request, Response } from "express";
import {
  reportServerService,
  type ReportServerFilterQuery,
  type ReportServerListQuery,
} from "./service.js";

/** HTTP handlers for the Report Server. Thin: parse, call the service, respond. */

function toFilterQuery(query: Request["query"]): ReportServerFilterQuery {
  const q = query as Record<string, string | undefined>;
  return {
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    status: q.status,
    senderPartner: q.senderPartner,
    receiverPartner: q.receiverPartner,
    documentStandard: q.documentStandard,
    messageType: q.messageType,
    controlNumber: q.controlNumber,
  };
}

/** GET / — interchanges, newest first. */
export async function list(req: Request, res: Response): Promise<void> {
  const q = req.query as Record<string, string | undefined>;
  const query: ReportServerListQuery = {
    ...toFilterQuery(req.query),
    page: q.page === undefined ? undefined : Number(q.page),
    pageSize: q.pageSize === undefined ? undefined : Number(q.pageSize),
  };
  res.json(await reportServerService.list(query));
}

/** GET /summary — status counts for the KPI strip. */
export async function summary(req: Request, res: Response): Promise<void> {
  res.json(await reportServerService.summary(toFilterQuery(req.query)));
}

/** GET /:interchangeId — interchange detail. */
export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await reportServerService.getById(req.params.interchangeId as string));
}

/** GET /:interchangeId/payloads/:payloadId — one payload with content. */
export async function getPayload(req: Request, res: Response): Promise<void> {
  res.json(
    await reportServerService.getPayload(
      req.params.interchangeId as string,
      req.params.payloadId as string,
    ),
  );
}
