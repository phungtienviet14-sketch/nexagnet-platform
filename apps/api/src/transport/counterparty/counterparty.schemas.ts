import { z } from 'zod';
import { COUNTERPARTY_SUBJECT_KINDS } from './counterparty.types.js';

const trimmed = z.string().trim();

/**
 * Ma so thue Viet Nam: 10 chu so, hoac 10 chu so + '-' + 3 chu so cho don vi truc thuoc.
 *
 * Khuon nay LAP LAI `CHECK TransportCounterparty_taxCode_shape` o migration, va do la co y: kiem o
 * day cho nguoi dung mot thong diep doc duoc, kiem o DB dung ke ca khi mot duong ghi khac quen.
 * Hai ban phai giong nhau — `transport-counterparty-storage.spec.ts` do dieu do.
 */
const taxCode = trimmed.regex(/^[0-9]{10}(-[0-9]{3})?$/, 'ma so thue phai la 10 so hoac 10-3 so');

export const counterpartySubjectKindSchema = z.enum(COUNTERPARTY_SUBJECT_KINDS);

export const createCounterpartySchema = z
  .object({
    name: trimmed.min(1).max(200),
    taxCode: taxCode.nullish(),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export const updateCounterpartySchema = z
  .object({
    name: trimmed.min(1).max(200).optional(),
    taxCode: taxCode.nullish(),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export const linkSubjectSchema = z
  .object({
    kind: counterpartySubjectKindSchema,
    subjectId: trimmed.min(1).max(100),
  })
  .strict();

export type CreateCounterpartyBody = z.infer<typeof createCounterpartySchema>;
export type UpdateCounterpartyBody = z.infer<typeof updateCounterpartySchema>;
export type LinkSubjectBody = z.infer<typeof linkSubjectSchema>;
