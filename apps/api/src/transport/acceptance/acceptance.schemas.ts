import { z } from 'zod';
import {
  COMMERCIAL_ACCEPTANCE_BASES,
  COMMERCIAL_ACCEPTANCE_OUTCOMES,
  COMMERCIAL_ACCEPTANCE_STATES,
} from './acceptance.types.js';

/**
 * BIEN VAO cua truc nghiem thu.
 *
 * ============================================================================================
 * BA TRUONG CO Y KHONG TON TAI O DAY
 * ============================================================================================
 *
 *   · `decidedBy`  — danh tinh den tu PHIEN (`requireAuthUserId`). `#268` I3: *"no caller-supplied
 *     `decidedBy`"*. Khong khai truong nay nghia la khong co gi de bo qua: mot ben goi gui no len
 *     se bi `.strict()` tu choi thay vi bi im lang lo di.
 *   · `decidedAt`  — gio den tu MAY CHU. Bai I7 so 14.
 *   · `role`       — `#268` I3: *"no self-asserted role in payload"*. Vai den tu phien, va
 *     `TransportActionGuard` doc no o do.
 *
 * `.strict()` la thu bien "khong khai" thanh "tu choi". Khong co no, ba truong tren se di qua bien
 * ma khong ai biet, va mot ngay nao do mot lan sua vo y se doc lay chung.
 */

/**
 * MA LY DO — mot MA, khong phai mot cau.
 *
 * `max(60)` khop `@db.VarChar(60)` cua `TransportExpenseClaimDecision.reasonCode`, va quy uoc cung
 * la quy uoc do: ma de MAY loc, cau de NGUOI doc (`externalNote`). Mot truong tu do o day se lam
 * bao cao "vi sao chung tu bi tra lai" khong gom nhom duoc.
 */
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Ma ly do viet HOA, gach duoi, khong dau');

/**
 * KHOA CHONG GHI TRUNG do ben goi dat.
 *
 * BAT BUOC, khong tuy chon. `#268` I4 doi *"Retry with same idempotency key returns the same
 * business effect"* — mot khoa tuy chon se lam duong an toan tro thanh duong ma khong ai di, vi
 * cach de nhat luon la khong gui gi ca.
 */
const idempotencyKeySchema = z.string().trim().min(8).max(120);

export const recordAcceptanceDecisionSchema = z
  .object({
    outcome: z.enum(COMMERCIAL_ACCEPTANCE_OUTCOMES),
    reasonCode: reasonCodeSchema,
    basis: z.enum(COMMERCIAL_ACCEPTANCE_BASES),
    /**
     * Khoa DUC cua chung tu. Mac dinh la mang rong chu khong phai `undefined`: mot duong tu choi
     * khong can chung tu nao, va bat nguoi dung gui `[]` de tu choi la mot nghi thuc vo nghia.
     *
     * `max(20)` khong phai mot con so nghiep vu — no la mot tran chan lam dung. Mot lan nghiem thu
     * that co vai chung tu; hai muoi la du rong de khong ai cham vao va du hep de mot vong lap
     * kiem quyen khong bi keo dai vo han.
     */
    evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    externalNote: z.string().trim().min(1).max(2000).nullish(),
    counterpartyId: z.string().trim().min(1).max(120).nullish(),
    /** Quyet dinh ma lenh nay SUA. Vang mat o lan dau — xem `evaluateAcceptanceDecision`. */
    supersedesId: z.string().trim().min(1).max(120).nullish(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordAcceptanceDecisionBody = z.infer<typeof recordAcceptanceDecisionSchema>;

/** Bo loc cua hang cho. `state` vang mat = xem tat ca. */
export const acceptanceQuerySchema = z
  .object({ state: z.enum(COMMERCIAL_ACCEPTANCE_STATES).optional() })
  .strict();
