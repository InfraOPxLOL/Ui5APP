import { z } from "zod";

/** Filters shared by the list and summary endpoints. Every field is optional and ANDed. */
const filterFields = {
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  status: z.string().trim().min(1).max(60).optional(),
  senderPartner: z.string().trim().min(1).max(120).optional(),
  receiverPartner: z.string().trim().min(1).max(120).optional(),
  documentStandard: z.string().trim().min(1).max(60).optional(),
  messageType: z.string().trim().min(1).max(60).optional(),
  controlNumber: z.string().trim().min(1).max(60).optional(),
  interchangeId: z.string().trim().min(1).max(120).optional(),
  mplId: z.string().trim().min(1).max(120).optional(),
  direction: z.string().trim().min(1).max(40).optional(),
  agreement: z.string().trim().min(1).max(120).optional(),
  transactionType: z.string().trim().min(1).max(120).optional(),
  interchangeName: z.string().trim().min(1).max(200).optional(),
  systemId: z.string().trim().min(1).max(120).optional(),
  adapterType: z.string().trim().min(1).max(60).optional(),
  groupControlNumber: z.string().trim().min(1).max(60).optional(),
  messageNumber: z.string().trim().min(1).max(60).optional(),
  processingStatus: z.string().trim().min(1).max(60).optional(),
  technicalAckStatus: z.string().trim().min(1).max(60).optional(),
  functionalAckStatus: z.string().trim().min(1).max(60).optional(),
};

export const listQuerySchema = z.object({
  ...filterFields,
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

export const summaryQuerySchema = z.object(filterFields);

export const interchangeIdParamSchema = z.object({
  interchangeId: z.string().trim().min(1).max(120),
});

export const payloadParamSchema = interchangeIdParamSchema.extend({
  payloadId: z.string().trim().min(1).max(200),
});
