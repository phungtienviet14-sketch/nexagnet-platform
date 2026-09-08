import { z } from 'zod';

/**
 * BIEN HTTP cua lop lap ke hoach. Moi schema deu `.strict()` — cung ly le da ghi o
 * `movement.schemas.ts`: mot truong go sai ten phai bi TU CHOI, khong bi bo qua im lang.
 */

const trimmed = z.string().trim();
const reference = trimmed.min(1).max(100);

/** Km la cot `Int` cua Postgres, nen tran la `int32`. Cung hang so voi `movement.schemas.ts`. */
const PG_INT32_MAX = 2_147_483_647;
const countedInt = z.number().int().nonnegative().max(PG_INT32_MAX);

/**
 * Km DU KIEN do nguoi goi mang toi. `nullish()` chu khong `.default(0)`: `#276` L6 viet
 * *"If distance is unknown: preserve null/unknown; do not use 0."*
 */
const distanceHint = {
  plannedEmptyKm: countedInt.nullish(),
  plannedLoadedKm: countedInt.nullish(),
};

export const planPreviewSchema = z.object({ vehicleId: reference, ...distanceHint }).strict();

/**
 * `idempotencyKey` la BAT BUOC, khong phai tuy chon.
 *
 * Mot lenh ghi khong khoa se lam `#276` L9 bai 1 (*"same Order assignment retry creates one
 * run/loaded leg effect"*) khong the dat duoc: khong co gi de nhan ra lan thu hai la lan thu hai.
 * `120` la cung do rong voi `TransportCommercialAcceptanceDecision.idempotencyKey`.
 */
export const planCommitSchema = z
  .object({ vehicleId: reference, idempotencyKey: trimmed.min(1).max(120), ...distanceHint })
  .strict();

export const planCancelSchema = z.object({ reason: trimmed.min(1).max(500) }).strict();

/**
 * `CANCELLED` CO Y vang mat: huy mot chang di duong rieng vi no doi mot ly do bang chu, va chi
 * chang CHUA CHAY moi huy duoc. Cung khuon voi `orderTransitionSchema`/`runTransitionSchema`.
 */
export const legTransitionSchema = z.object({ to: z.enum(['IN_TRANSIT', 'COMPLETED']) }).strict();

export const legCancelSchema = z.object({ reason: trimmed.min(1).max(500) }).strict();

export type PlanPreviewBody = z.infer<typeof planPreviewSchema>;
export type PlanCommitBody = z.infer<typeof planCommitSchema>;
export type PlanCancelBody = z.infer<typeof planCancelSchema>;
export type LegTransitionBody = z.infer<typeof legTransitionSchema>;
export type LegCancelBody = z.infer<typeof legCancelSchema>;
