import { z } from 'zod';
import {
  ASSET_STAKEHOLDER_KINDS,
  OWNERSHIP_BASIS_POINTS_TOTAL,
  VEHICLE_OPERATIONAL_CONTROLS,
} from './asset-ownership.types.js';

const trimmed = z.string().trim();

/**
 * DIEM CO BAN — so NGUYEN 1..10000, khong phai phan tram.
 *
 * Khuon nay LAP LAI `CHECK TransportVehicleOwnershipInterest_bps_range` o migration, va do la co y:
 * kiem o day cho nguoi dung mot thong diep doc duoc, kiem o DB dung ke ca khi mot duong ghi khac
 * quen. Hai ban phai giong nhau — `transport-asset-ownership-storage.spec.ts` do dieu do.
 *
 * `.int()` khong phai trang tri: mot `50.5` lot qua se thanh mot ty le khong bieu dien duoc, va bat
 * bien tong (`=== 10000`) se khong bao gio dung nua tren chiec xe do.
 */
const basisPoints = z
  .number()
  .int('ty le so huu phai la so nguyen diem co ban')
  .min(1, 'ty le so huu phai tu 1 diem co ban tro len')
  .max(
    OWNERSHIP_BASIS_POINTS_TOTAL,
    `ty le so huu khong duoc vuot ${OWNERSHIP_BASIS_POINTS_TOTAL} diem co ban (100%)`,
  );

/** Moc thoi gian ISO-8601. Chuoi khong doc duoc bi chan o day, khong phai o `new Date()`. */
const instant = trimmed.refine(
  (value) => !Number.isNaN(Date.parse(value)),
  'moc thoi gian phai la chuoi ISO-8601 doc duoc',
);

export const assetStakeholderKindSchema = z.enum(ASSET_STAKEHOLDER_KINDS);
export const vehicleOperationalControlSchema = z.enum(VEHICLE_OPERATIONAL_CONTROLS);

export const createStakeholderSchema = z
  .object({
    kind: assetStakeholderKindSchema,
    displayName: trimmed.min(1).max(200),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export const updateStakeholderSchema = z
  .object({
    displayName: trimmed.min(1).max(200).optional(),
    note: trimmed.max(1000).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

/**
 * `authUserId: null` la GO cau noi, va no phai la mot gia tri MINH THI.
 *
 * `.nullable()` chu khong `.nullish()`: neu bo trong truong nay cung go duoc tai khoan, thi mot
 * than yeu cau go sai truong se lang le thu hoi quyen doc cua mot nguoi.
 */
export const linkStakeholderAccountSchema = z
  .object({ authUserId: trimmed.min(1).max(100).nullable() })
  .strict();

export const recordInterestSchema = z
  .object({
    stakeholderId: trimmed.min(1).max(100),
    ownershipBasisPoints: basisPoints,
    effectiveFrom: instant,
    note: trimmed.max(1000).nullish(),
  })
  .strict();

export const closeInterestSchema = z
  .object({ effectiveTo: instant, note: trimmed.max(1000).nullish() })
  .strict();

export const declareRegisterSchema = z.object({ complete: z.boolean() }).strict();

export const setOperationalControlSchema = z
  .object({ operationalControl: vehicleOperationalControlSchema })
  .strict();

export type CreateStakeholderBody = z.infer<typeof createStakeholderSchema>;
export type UpdateStakeholderBody = z.infer<typeof updateStakeholderSchema>;
export type RecordInterestBody = z.infer<typeof recordInterestSchema>;
export type CloseInterestBody = z.infer<typeof closeInterestSchema>;
