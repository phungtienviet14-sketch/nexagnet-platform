import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { businessDateSchema } from '../transport.schemas.js';

const identifier = z.string().trim().min(1).max(160);
const idempotencyKey = z.string().trim().min(8).max(160);
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'ma tien te phai co dung ba chu cai HOA')
  .default('VND');
const amount = z.number().int().positive().max(MONEY_MAX_AMOUNT);
const arBusinessDate = businessDateSchema.refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  },
  'ngay nghiep vu khong ton tai tren lich',
);
const note = z.string().trim().min(1).max(500);
const optionalNote = note.nullish();
const evidenceRefs = z.array(z.string().trim().min(1).max(200)).max(20).default([]);

export const customerArListQuerySchema = z.object({ customerId: identifier.optional() }).strict();

export const customerArSummaryQuerySchema = z
  .object({
    asOf: arBusinessDate,
    customerId: identifier.optional(),
  })
  .strict();

export const confirmCustomerOrderSchema = z
  .object({
    batchLineId: identifier.nullish(),
    confirmedAmount: amount,
    currencyCode,
    businessDate: arBusinessDate,
    differenceReason: optionalNote,
    confirmationReference: z.string().trim().min(1).max(120).nullish(),
    evidenceRefs,
    idempotencyKey,
  })
  .strict();

export const createCustomerReconciliationBatchSchema = z
  .object({
    customerId: identifier,
    orderIds: z.array(identifier).min(1).max(500),
    currencyCode,
    periodStart: arBusinessDate.nullish(),
    periodEnd: arBusinessDate.nullish(),
    reference: z.string().trim().min(1).max(120).nullish(),
    note: optionalNote,
    idempotencyKey,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.orderIds).size !== value.orderIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['orderIds'],
        message: 'mot Order chi xuat hien mot lan',
      });
    }
    if (Boolean(value.periodStart) !== Boolean(value.periodEnd)) {
      ctx.addIssue({
        code: 'custom',
        path: [value.periodStart ? 'periodEnd' : 'periodStart'],
        message: 'ky doi soat phai co ca ngay bat dau va ngay ket thuc',
      });
    }
    if (value.periodStart && value.periodEnd && value.periodStart > value.periodEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodEnd'],
        message: 'ngay ket thuc ky khong duoc truoc ngay bat dau',
      });
    }
  });

const resolveBatchLineSchema = z.discriminatedUnion('action', [
  z
    .object({
      lineId: identifier,
      action: z.literal('CONFIRM'),
      confirmedAmount: amount,
      businessDate: arBusinessDate,
      differenceReason: optionalNote,
      confirmationReference: z.string().trim().min(1).max(120).nullish(),
      evidenceRefs,
    })
    .strict(),
  z
    .object({
      lineId: identifier,
      action: z.literal('DEFER'),
      reason: note,
    })
    .strict(),
]);

export const resolveCustomerReconciliationBatchSchema = z
  .object({
    decisions: z.array(resolveBatchLineSchema).min(1).max(500),
    idempotencyKey,
  })
  .strict()
  .superRefine((value, ctx) => {
    const lineIds = value.decisions.map((decision) => decision.lineId);
    if (new Set(lineIds).size !== lineIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisions'],
        message: 'mot dong chi duoc quyet mot lan',
      });
    }
  });

export const recordCustomerPaymentSchema = z
  .object({
    customerId: identifier,
    amount,
    currencyCode,
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    businessDate: arBusinessDate,
    externalRef: z.string().trim().min(1).max(120).nullish(),
    note: optionalNote,
    idempotencyKey,
  })
  .strict();

export const allocateCustomerPaymentSchema = z
  .object({
    documentId: identifier,
    amount,
    businessDate: arBusinessDate,
    note: optionalNote,
    idempotencyKey,
  })
  .strict();

export const releaseCustomerPaymentAllocationSchema = z
  .object({
    businessDate: arBusinessDate,
    note: optionalNote,
    idempotencyKey,
  })
  .strict();

export type ConfirmCustomerOrderBody = z.infer<typeof confirmCustomerOrderSchema>;
export type CreateCustomerReconciliationBatchBody = z.infer<
  typeof createCustomerReconciliationBatchSchema
>;
export type ResolveCustomerReconciliationBatchBody = z.infer<
  typeof resolveCustomerReconciliationBatchSchema
>;
export type RecordCustomerPaymentBody = z.infer<typeof recordCustomerPaymentSchema>;
export type AllocateCustomerPaymentBody = z.infer<typeof allocateCustomerPaymentSchema>;
export type ReleaseCustomerPaymentAllocationBody = z.infer<
  typeof releaseCustomerPaymentAllocationSchema
>;
