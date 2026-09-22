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
 * `#317` G0 — mot quyet dinh chi bi THAY THE mot lan.
 *
 * Luoi thu hai sau khoa hang doi soat: neu mot duong ghi tuong lai quen lay khoa, hai lan doi y
 * dong thoi ve cung mot quyet dinh se dam vao day thay vi re chuoi thanh hai nhanh "hieu luc".
 *
 * KHONG nam trong `FUEL_UNIQUE_INDEXES`: danh sach do duoc `transport-fuel-storage.spec.ts` doi chieu
 * voi migration GOC cua T4. Index nay sinh o `20260917100000_transport_fuel_residual`, va
 * `transport-fuel-residual-storage.spec.ts` khoa no o do.
 */
export const FUEL_DECISION_SUPERSEDED_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelDiscrepancy_supersedesId_key',
  model: 'TransportFuelDiscrepancy',
  column: 'supersedesId',
};

/**
 * `#317` G1 — ten TRIGGER giu tram tren phieu thuoc dung nha cung cap cua phieu.
 *
 * Tang mien chan truoc voi ma `FUEL_STATION_SUPPLIER_MISMATCH`; trigger chi con la luoi cuoi cho moi
 * duong ghi khong di qua tang do. Cung co che nhan dien bang THONG DIEP voi `INV-26` ben duoi.
 */
export const FUEL_ENTRY_STATION_SUPPLIER = 'TransportFuelEntry_station_supplier';

export const isStationSupplierViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_STATION_SUPPLIER);

/* ------------------------------------------------------------------ *
 * `#364` — Fuel Event Run-first (`20260922100000_transport_fuel_run_first`)
 * ------------------------------------------------------------------ */

/**
 * Hai TIEN TO thong diep cua trigger `transport_fuel_entry_run_context` — mot cho moi cau hoi.
 *
 * Hai tien to chu khong mot: "vong chay khong phai cua xe nay" va "chang khong thuoc vong chay nay"
 * doi nguoi dung sua hai thu khac nhau, nen tang kho phai tra ve hai ma khac nhau.
 */
export const FUEL_ENTRY_RUN_VEHICLE = 'transport_fuel_entry_run_vehicle';
export const FUEL_ENTRY_LEG_RUN = 'transport_fuel_entry_leg_run';

export const isRunVehicleViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_RUN_VEHICLE);

export const isLegRunViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_LEG_RUN);

/**
 * `CHECK` cua `#364` — tien mat lai xe ung chi tren chuyen v1. DA GO boi `#369` R-4
 * (`20260923110000_transport_fuel_run_first_driver_cash`): Quy lai xe nay co duong ghi khong chuyen
 * (`RUN_EXPENSE`). Ten con o day vi `transport-fuel-run-first-storage.spec.ts` khoa migration GOC cua
 * `#364` (lich su), va spec cua R-4 khoa chinh lenh go no.
 */
export const FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP = 'TransportFuelEntry_driver_cash_needs_trip';

/* ------------------------------------------------------------------ *
 * `#369` R-4 — chan Quy lai xe cua phieu Run-first `DRIVER_CASH`
 * ------------------------------------------------------------------ */

/** Mot but toan quy khong the la chan tien mat cua hai phieu dau — doi xung `FUEL_ENTRY_COST_ONCE`. */
export const FUEL_ENTRY_DRIVER_FUND_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelEntry_driverFundEntryId_key',
  model: 'TransportFuelEntry',
  column: 'driverFundEntryId',
};

/** `CHECK` — chan Quy rieng CHI tren phieu `tripId` NULL + `DRIVER_CASH` + `VERIFIED`. */
export const FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE = 'TransportFuelEntry_driver_fund_leg_shape';

/** Tien to thong diep cua trigger: but toan gan vao phai DUNG la chan Quy cua CHINH phieu. */
export const FUEL_ENTRY_DRIVER_FUND_LEG = 'transport_fuel_entry_driver_fund_leg';

export const isDriverFundLegShapeViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE);

export const isDriverFundLegViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_DRIVER_FUND_LEG);

/**
 * Loi cua TANG KHO khi duoc goi gan chan Quy vao mot phieu KHONG du dieu kien — CUNG ten voi `CHECK`.
 *
 * Khong co ma tu choi cho nguoi dung: khong duong goi hop le nao di toi day (`postFuelCost` chi goi
 * voi phieu Run-first `DRIVER_CASH` vua duyet), nen gap no la mot loi LAP TRINH — `500`, khong phai
 * mot `4xx` bao nguoi dung sua dau vao. Cung ly le voi `costExpenseOnRunFirstEntry`.
 */
export const driverFundLegOnIneligibleEntry = (fuelEntryId: string): Error =>
  new Error(
    `${FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE}: phieu ${fuelEntryId} khong phai phieu Run-first DRIVER_CASH ` +
      'da duyet — khong gan duoc chan Quy lai xe rieng',
  );

/**
 * `CHECK` — MOT PHIEU, MOT SO CAI, chieu `TX-03`: chan gia thanh chuyen v1 (`costExpenseId`) CHI tren
 * phieu gan chuyen v1. Chieu con lai (phieu chuyen v1 khong co dong phan bo) la
 * `FUEL_COST_ATTRIBUTION_TRIGGER.legacyTrip`.
 *
 * Hai kho NEM loi mang CHINH ten nay khi bi goi gan chan `TX-03` vao phieu Run-first — truoc khi
 * lenh ghi toi CSDL. Khong co ma tu choi cho nguoi dung: khong duong goi hop le nao di toi day
 * (`postFuelCost` dung phieu Run-first o `FUEL_COST_AWAITS_ATTRIBUTION`), nen gap no la mot loi LAP
 * TRINH, va no phai la `500`, khong phai mot `4xx` bao nguoi dung sua dau vao.
 */
export const FUEL_ENTRY_COST_EXPENSE_NEEDS_TRIP = 'TransportFuelEntry_cost_expense_needs_trip';

export const isCostExpenseNeedsTripViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUEL_ENTRY_COST_EXPENSE_NEEDS_TRIP);

/** Loi cua TANG KHO — cung ten voi `CHECK`, de nguoi doc log/trace nhan ra ngay cung mot bat bien. */
export const costExpenseOnRunFirstEntry = (fuelEntryId: string): Error =>
  new Error(
    `${FUEL_ENTRY_COST_EXPENSE_NEEDS_TRIP}: phieu ${fuelEntryId} khong gan chuyen v1 — gia thanh cua no ` +
      'nam o TransportFuelCostAttribution, khong gan duoc chan TX-03',
  );

/**
 * `#364` — mot dong phan bo gia thanh chi co MOT khoa chong ghi trung, va mot cap phat chi dao
 * duoc MOT lan.
 *
 * KHONG nam trong `FUEL_UNIQUE_INDEXES` — cung ly do voi `FUEL_DECISION_SUPERSEDED_ONCE`: danh sach
 * do doi chieu voi migration GOC cua T4. `transport-fuel-run-first-storage.spec.ts` khoa hai index
 * nay o migration cua chinh chung.
 */
export const FUEL_COST_ATTRIBUTION_CORRELATION: UniqueIndexRef = {
  indexName: 'TransportFuelCostAttribution_correlationKey_key',
  model: 'TransportFuelCostAttribution',
  column: 'correlationKey',
};

export const FUEL_COST_ATTRIBUTION_REVERSED_ONCE: UniqueIndexRef = {
  indexName: 'TransportFuelCostAttribution_reversalOfId_key',
  model: 'TransportFuelCostAttribution',
  column: 'reversalOfId',
};

/**
 * Tien to thong diep cua trigger `transport_fuel_cost_attribution_guard` — luoi cuoi sau tang mien.
 *
 * Tang mien doc tong + kiem tren hang phieu DA KHOA truoc khi ghi, nen o duong ghi that nhung ma
 * nay khong no. Chung con do cho moi lan ghi khong di qua tang mien (va cho bai kiem Postgres chung
 * minh luoi do la THAT).
 */
export const FUEL_COST_ATTRIBUTION_TRIGGER = {
  exceedsEntry: 'transport_fuel_cost_attribution_exceeds_entry',
  legacyTrip: 'transport_fuel_cost_attribution_legacy_trip',
  notVerified: 'transport_fuel_cost_attribution_not_verified',
  targetVehicle: 'transport_fuel_cost_attribution_target_vehicle',
  legRun: 'transport_fuel_cost_attribution_leg_run',
  reversalShape: 'transport_fuel_cost_attribution_reversal_shape',
  appendOnly: 'transport_fuel_cost_attribution_append_only',
} as const;

export const isFuelCostAttributionTriggerViolation = (
  error: unknown,
  name: keyof typeof FUEL_COST_ATTRIBUTION_TRIGGER,
): boolean => error instanceof Error && error.message.includes(FUEL_COST_ATTRIBUTION_TRIGGER[name]);

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
