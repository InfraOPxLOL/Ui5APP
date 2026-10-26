import type { Request, Response } from "express";
import {
  transactionsService,
  type TransactionFrameworkFilter,
  type TransactionListQuery,
} from "./transactions.js";
import {
  reportServerService,
  type ReportServerFilterQuery,
  type ReportServerListQuery,
} from "./service.js";

/** HTTP handlers for the Report Server. Thin: parse, call the service, respond. */

/** Every filter the list and summary endpoints accept (already validated by the route). */
const FILTER_FIELDS: readonly (keyof ReportServerFilterQuery)[] = [
  "dateFrom",
  "dateTo",
  "status",
  "senderPartner",
  "receiverPartner",
  "documentStandard",
  "messageType",
  "controlNumber",
  "interchangeId",
  "mplId",
  "direction",
  "agreement",
  "transactionType",
  "interchangeName",
  "systemId",
  "adapterType",
  "groupControlNumber",
  "messageNumber",
  "processingStatus",
  "technicalAckStatus",
  "functionalAckStatus",
];

export function toFilterQuery(query: Request["query"]): ReportServerFilterQuery {
  const q = query as Record<string, string | undefined>;
  return Object.fromEntries(
    FILTER_FIELDS.filter((field) => q[field] !== undefined).map((field) => [field, q[field]]),
  ) as ReportServerFilterQuery;
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

/** Every filter the transaction list accepts (already validated by the route). */
const TRANSACTION_FILTER_FIELDS = [
  "dateFrom",
  "dateTo",
  "status",
  "sender",
  "receiver",
  "integrationFlow",
  "correlationId",
  "mplId",
  "applicationId",
  "messageType",
] as const;

export function toTransactionQuery(query: Request["query"]): TransactionListQuery {
  const q = query as Record<string, string | undefined>;
  const filters = Object.fromEntries(
    TRANSACTION_FILTER_FIELDS.filter((field) => q[field] !== undefined).map((field) => [
      field,
      q[field],
    ]),
  );
  return {
    ...filters,
    framework: q.framework as TransactionFrameworkFilter | undefined,
    page: q.page === undefined ? undefined : Number(q.page),
    pageSize: q.pageSize === undefined ? undefined : Number(q.pageSize),
  };
}

/** GET /transactions — non-B2B transactions, newest first. */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  res.json(await transactionsService.list(toTransactionQuery(req.query)));
}

/** GET /transactions/:correlationId — one non-B2B transaction with every step. */
export async function getTransaction(req: Request, res: Response): Promise<void> {
  res.json(await transactionsService.getById(req.params.correlationId as string));
}
