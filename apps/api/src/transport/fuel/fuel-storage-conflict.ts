import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * RANG BUOC LUU TRU cua `TX-04` — DANH SACH thuoc ve `transport-fuel`, CO CHE nhan dien o
 * `../storage-conflict.js`.
 *
 * Cung ly le voi `costing/costing-storage-conflict.ts`: mot bang co nhieu unique, va bat `P2002`
 * chung chung se dich moi va cham thanh cung mot cau. Neu mot lan trung khoa chong ghi trung bi bao
 * thanh "dong bang ke nay da duoc khop roi", nguoi dung se di tim mot cap khop khong ton tai.
 *
 * Bai hoc T2.1 duoc mang nguyen sang day: Prisma KHONG chuyen ten index ra ngoai — no doi nguoc ten
 * constraint thanh TEN TRUONG. Do la ly do moi muc duoi day khai CA `indexName` LAN cap
 * `(model, column)`, va `isUniqueViolationOn` doi chieu ca hai duong.
 */

export const FUEL_ENTRY_CORRELATION: UniqueIndexRef = {
  indexName: 'TransportFuelEntry_correlationKey_key',
  model: 'TransportFuelEntry',
  column: 'correlationKey',
};

/** MOT khoan chi cua `TX-03` khong the la chan gia thanh cua hai phieu dau. */
export const FUEL_ENTRY_COST_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelEntry_costExpenseId_key',
  model: 'TransportFuelEntry',
  column: 'costExpenseId',
};

/** MOT bang ke duy nhat cho mot `(cay xang, ky)` — T1 §5. */
export const FUEL_STATEMENT_PERIOD: UniqueIndexRef = {
  indexName: 'TransportFuelSupplierStatement_supplierId_periodStart_perio_key',
  model: 'TransportFuelSupplierStatement',
  column: 'supplierId',
};

/** Mot dong bang ke khong khop duoc voi hai phieu. */
export const FUEL_MATCH_LINE_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelMatch_statementLineId_key',
  model: 'TransportFuelMatch',
  column: 'statementLineId',
};

/** Mot phieu khong khop duoc voi hai dong bang ke. */
export const FUEL_MATCH_ENTRY_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelMatch_fuelEntryId_key',
  model: 'TransportFuelMatch',
  column: 'fuelEntryId',
};

/**
 * `INV-26` — ten cua TRIGGER, khong phai cua mot unique.
 *
 * Vi sao phai xu ly rieng: mot trigger `RAISE EXCEPTION` khong mang ma `P2002`, va Prisma khong mo
 * ra mot truong co cau truc nao cho no. Thu duy nhat di ra ngoai la THONG DIEP — nen phep nhan
 * dien phai tim ten rang buoc trong chuoi do.
 *
 * Ten nay duoc nhung vao chinh thong diep cua `RAISE EXCEPTION` trong migration, khong phai do
 * Postgres tu them: xem `transport_fuel_match_no_self_source()`. Neu ai do sua thong diep do ma bo
 * ten di, `transport-fuel-storage.spec.ts` se do — no doc ca hai tep va doi hai ben khop nhau.
 */
export const FUEL_MATCH_NO_SELF_SOURCE = 'TransportFuelMatch_no_self_source';

export const isSelfSourcedMatchViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_MATCH_NO_SELF_SOURCE);

export const FUEL_UNIQUE_INDEXES: readonly UniqueIndexRef[] = [
  FUEL_ENTRY_CORRELATION,
  FUEL_ENTRY_COST_ONCE,
  FUEL_STATEMENT_PERIOD,
  FUEL_MATCH_LINE_ONCE,
  FUEL_MATCH_ENTRY_ONCE,
];
