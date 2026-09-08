import { z } from 'zod';

const trimmed = z.string().trim();

/**
 * Khuon o day LAP LAI hai `CHECK` cua migration `20260909230100_transport_counterparty_site`, va
 * do la co y: kiem o day cho nguoi dung mot thong diep doc duoc, kiem o DB dung ke ca khi mot
 * duong ghi khac quen. `transport-counterparty-site-storage.spec.ts` giu hai ban khong lech.
 *
 * `address` dung `.nullish()` chu khong `.optional()`: NULL la mot cau tra loi CO NGHIA ("chua
 * nhap dia chi"), khac han voi "khong gui truong nay len".
 */
export const createCounterpartySiteSchema = z
  .object({
    name: trimmed.min(1).max(200),
    address: trimmed.min(1).max(500).nullish(),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export const updateCounterpartySiteSchema = z
  .object({
    name: trimmed.min(1).max(200).optional(),
    address: trimmed.min(1).max(500).nullish(),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export type CreateCounterpartySiteBody = z.infer<typeof createCounterpartySiteSchema>;
export type UpdateCounterpartySiteBody = z.infer<typeof updateCounterpartySiteSchema>;
