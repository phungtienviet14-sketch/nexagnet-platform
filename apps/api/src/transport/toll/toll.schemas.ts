import { z } from 'zod';
import { TOLL_PROVIDERS, TOLL_SOURCE_KINDS, TOLL_TRANSACTION_KINDS } from './toll-provider.port.js';
import { TOLL_FILE_FORMATS } from './toll-statement-source.js';
import { TOLL_MATCH_STATES, TOLL_REVIEW_ACTIONS, TOLL_REVIEW_STATES } from './toll.types.js';

/**
 * KIEM DAU VAO o bien gioi HTTP — `.strict()` o moi noi.
 *
 * `.strict()` khong phai mot thoi quen: no la thu chan mot truong LA di lot vao mot lenh ghi. Neu
 * mot ngay ai do them `driverId` vao than yeu cau (co y hay vo tinh), `.strict()` tu choi ngay o
 * bien gioi — truoc khi mot dong phi duong bo kip di ve phia so quy lai xe.
 */

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD');

const nonEmpty = z.string().trim().min(1).max(200);

export const createTollAccountSchema = z
  .object({
    provider: z.enum(TOLL_PROVIDERS),
    accountNo: nonEmpty,
    holderName: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

export const updateTollAccountSchema = z.object({ active: z.boolean() }).strict();

export const openTollLinkSchema = z
  .object({
    vehicleId: nonEmpty,
    /** ND 119 Phu luc — "ma dinh danh the dau cuoi". Tuy chon: chua do duoc no co tren tep xuat. */
    providerVehicleRef: z.string().trim().max(200).nullable().default(null),
    effectiveFrom: businessDate,
    effectiveTo: businessDate.nullable().default(null),
  })
  .strict();

export const closeTollLinkSchema = z.object({ effectiveTo: businessDate }).strict();

/** MOT dong do nguoi van hanh go tay. Bieu nhap la CUA TA — xem `MANUAL_TOLL_COLUMNS`. */
const manualTollRowSchema = z
  .object({
    accountNo: nonEmpty,
    kind: z.enum(TOLL_TRANSACTION_KINDS),
    vehiclePlate: z.string().trim().max(32).nullable().default(null),
    passedAt: z.string().trim().max(40).nullable().default(null),
    businessDate: businessDate.nullable().default(null),
    /** Chuoi chu khong `number`: quy uoc phan cach hang nghin duoc doc o tang mien, mot lan. */
    amount: z.string().trim().min(1).max(32),
    station: z.string().trim().max(200).nullable().default(null),
    providerRef: z.string().trim().max(120).nullable().default(null),
  })
  .strict();

/**
 * MOT LENH NAP.
 *
 * `contentBase64` co bien do dai o TANG NAY nua, khong chi o tang doc tep: mot than yeu cau khong
 * lo phai bi tu choi TRUOC khi no duoc giai ma vao bo nho (#269 J9).
 */
export const tollImportSchema = z
  .object({
    provider: z.enum(TOLL_PROVIDERS),
    sourceKind: z.enum(TOLL_SOURCE_KINDS),
    sourceLabel: nonEmpty,
    periodStart: businessDate.nullable().default(null),
    periodEnd: businessDate.nullable().default(null),
    format: z.enum(TOLL_FILE_FORMATS).optional(),
    contentBase64: z.string().max(12_000_000).optional(),
    rows: z.array(manualTollRowSchema).max(20_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sourceKind === 'STATEMENT_FILE' && (value.contentBase64 ?? '') === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['contentBase64'],
        message: 'nap tu tep thi phai co noi dung tep',
      });
    }
    if (value.sourceKind === 'MANUAL' && (value.rows ?? []).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows'],
        message: 'nhap tay thi phai co it nhat mot dong',
      });
    }
  });

export const listTollCandidatesQuerySchema = z
  .object({
    provider: z.enum(TOLL_PROVIDERS).optional(),
    importId: nonEmpty.optional(),
    accountId: nonEmpty.optional(),
    matchState: z.enum(TOLL_MATCH_STATES).optional(),
    reviewState: z.enum(TOLL_REVIEW_STATES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const listTollProviderQuerySchema = z
  .object({ provider: z.enum(TOLL_PROVIDERS).optional() })
  .strict();

/**
 * MOT LAN QUYET cua nguoi doi soat.
 *
 * `note` la CHU CHO NGUOI DOC, khong thay the `reason` — `reason` la mot ma do he thong sinh tu
 * `action`, nen nguoi goi khong tu dat duoc mot ly do tuy y vao lich su kiem toan.
 */
export const tollReviewSchema = z
  .object({
    action: z.enum(TOLL_REVIEW_ACTIONS),
    vehicleId: nonEmpty.nullable().default(null),
    duplicateOfCandidateId: nonEmpty.nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict();
