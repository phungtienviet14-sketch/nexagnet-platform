import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * BON UNIQUE cua so cai — DANH SACH thuoc ve `transport-costing`, CO CHE nhan dien o
 * `../storage-conflict.js`.
 *
 * Vi sao phai khai ten index o TypeScript thay vi bat `P2002` chung chung: mot bang co nhieu unique,
 * va bat chung chung se dich moi va cham thanh cung mot cau. Neu mot lan trung khoa chong ghi trung
 * bi bao thanh "but toan nay da duoc dao roi", nguoi dung se di tim mot but toan dao khong ton tai.
 *
 * Bai hoc T2.1 duoc mang nguyen sang day: Prisma KHONG chuyen ten index ra ngoai — no doi nguoc ten
 * constraint thanh TEN TRUONG (`meta.target = ['correlationKey']`). Do la ly do moi muc duoi day
 * khai CA `indexName` LAN cap `(model, column)`, va `isUniqueViolationOn` doi chieu ca hai duong.
 */

/**
 * MOT LAI XE, MOT SO QUY. `#369` — ten nay can den o `ensureAccount`: hai lan ghi Quy DAU TIEN cua
 * cung mot lai xe chay song song deu thay "chua co" roi deu `INSERT`, va ben thua phai DOC LAI so quy
 * vua ra doi thay vi nem mot loi Prisma tho ra tan HTTP.
 */
export const FUND_ACCOUNT_DRIVER: UniqueIndexRef = {
  indexName: 'TransportDriverFundAccount_driverId_key',
  model: 'TransportDriverFundAccount',
  column: 'driverId',
};

export const FUND_ENTRY_CORRELATION: UniqueIndexRef = {
  indexName: 'TransportDriverFundEntry_correlationKey_key',
  model: 'TransportDriverFundEntry',
  column: 'correlationKey',
};

export const TRIP_EXPENSE_CORRELATION: UniqueIndexRef = {
  indexName: 'TransportTripExpense_correlationKey_key',
  model: 'TransportTripExpense',
  column: 'correlationKey',
};

/** MOT but toan chi duoc dao MOT lan — `INV-20` khong co duong dao hai lan. */
export const FUND_ENTRY_REVERSAL_ONCE: UniqueIndexRef = {
  indexName: 'TransportDriverFundEntry_reversalOfId_key',
  model: 'TransportDriverFundEntry',
  column: 'reversalOfId',
};

export const TRIP_EXPENSE_REVERSAL_ONCE: UniqueIndexRef = {
  indexName: 'TransportTripExpense_reversalOfId_key',
  model: 'TransportTripExpense',
  column: 'reversalOfId',
};

export const CORRELATION_INDEXES: readonly UniqueIndexRef[] = [
  FUND_ENTRY_CORRELATION,
  TRIP_EXPENSE_CORRELATION,
];

export const REVERSAL_ONCE_INDEXES: readonly UniqueIndexRef[] = [
  FUND_ENTRY_REVERSAL_ONCE,
  TRIP_EXPENSE_REVERSAL_ONCE,
];

/**
 * `#369` R-4 — tien to thong diep cua trigger `transport_driver_fund_entry_run_context`: chang cua
 * but toan phai thuoc CHINH vong chay cua no.
 *
 * Tang mien (`RunExpenseService`) kiem truoc voi ma `RUN_EXPENSE_LEG_NOT_IN_RUN`, va `runId` cua chang
 * khong doi sau khi tao — nen o duong ghi that trigger khong no. No con do cho moi lan ghi khong di
 * qua tang mien; khi do nguoi goi van nhan DUNG ma, khong phai mot `500`.
 */
export const FUND_ENTRY_LEG_RUN = 'transport_driver_fund_entry_leg_run';

export const isFundEntryLegRunViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(FUND_ENTRY_LEG_RUN);

/**
 * EXCLUDE constraint chan hai ky quy chong lap cho cung mot so quy.
 *
 * Khong phai mot unique index, nen Prisma bao no bang mot ma KHAC (`P2010`/loi tho) chu khong phai
 * `P2002`. Ten duoc khai o day de tang kho doi chieu bang CHUOI trong thong diep — cach duy nhat
 * con lai khi driver khong mo ra mot ma rieng.
 */
export const FUND_PERIOD_NO_OVERLAP = 'TransportDriverFundPeriod_no_overlap';
