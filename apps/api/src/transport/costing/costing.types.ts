import type { BusinessDate } from '../business-date.js';
import type {
  DriverFundEntryKind,
  ExpenseFundingSource,
  TripExpenseKind,
} from './driver-fund-ledger.js';
import type { FundPeriodStatus } from './fund-period.js';

/**
 * `TX-03 Costing` — hinh dang du lieu doc len tu kho.
 *
 * Tach khoi `transport.types.ts` (thuoc `transport-core`) vi mot khach van tai co the bat
 * `transport-core` ma khong bat `transport-costing`. Tron chung se lam kieu cua so quy co mat
 * trong ban build cua mot khach khong he co so quy.
 */

/**
 * SO QUY cua mot lai xe. MOT tai khoan cho MOT lai xe.
 *
 * KHONG co truong `balance`. Do la ca noi dung cua `INV-01`: so du la KET QUA cong don but toan,
 * khong phai mot o nho. Neu o day co mot cot so du thi lan dau tien mot loi xay ra giua "ghi but
 * toan" va "cap nhat so du", hai con so se lech nhau vinh vien va khong ai biet ben nao dung.
 * So du duoc tra ve trong `DriverFundStatement` — mot KHUNG NHIN, khong phai mot bang.
 */
export interface DriverFundAccount {
  readonly id: string;
  readonly driverId: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * MOT BUT TOAN so quy. BAT BIEN — khong co ham `update` hay `delete` nao o tang kho (`INV-20`).
 */
export interface DriverFundEntry {
  readonly id: string;
  readonly accountId: string;
  readonly kind: DriverFundEntryKind;
  /** So nguyen dong CO DAU. Quy uoc dau: xem `driver-fund-ledger.ts`. */
  readonly signedAmount: number;
  readonly currencyCode: string;
  /** `INV-25` — tinh mot lan luc ghi theo mui gio tenant, khong suy tu `createdAt`. */
  readonly businessDate: BusinessDate;
  /** `INV-02` — NULLABLE. Mot lan tam ung khong gan chuyen nao la chuyen binh thuong. */
  readonly tripId: string | null;
  /**
   * KHOA CHONG GHI TRUNG, va cung la soi day noi hai lop cua MOT su kien kinh te (`INV-03`).
   *
   * Mot khoan chi tu quy sinh but toan nay VA mot `TripExpense`; ca hai mang cung mot gia tri.
   * Nho vay "tong cong ty bo ra" doi soat duoc ma khong bao gio phai cong hai lop lai.
   */
  readonly correlationKey: string;
  /** Tro toi but toan bi dao. NULL o moi but toan khong phai `REVERSAL`. */
  readonly reversalOfId: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

/** MOT DONG GIA THANH cua mot chuyen. `tripId` BAT BUOC — `INV-02`. */
export interface TripExpense {
  readonly id: string;
  readonly tripId: string;
  readonly kind: TripExpenseKind;
  /** Ma nhom chi phi (BOT, bai xe, sua chua doc duong...). Danh muc la cau hinh cua goi khach. */
  readonly categoryCode: string;
  /** So nguyen dong CO DAU: khoan chi duong, dong dao am. */
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  /** Dong quy sinh doi. NULL khi `fundedBy = COMPANY_DIRECT` — `INV-03` chi doi hai lop o mot ve. */
  readonly driverFundEntryId: string | null;
  /** Lai xe chiu trach nhiem khoan chi. NULL cho khoan cong ty tra thang. */
  readonly driverId: string | null;
  readonly correlationKey: string;
  readonly reversalOfId: string | null;
  /**
   * BANG CHUNG (anh phieu, chung tu) — mot THAM CHIEU, khong phai mot he thong quan ly tai lieu.
   *
   * `PG-05` (primitive chung tu co vong doi) thuoc Platform Track va chua co. Issue #85 cho phep
   * giu mot tham chieu nho thuoc mien van tai thay vi chan T3 lai, va CAM dung len mot he tai lieu
   * song song. Nen o day dung hai cot, khong bang con, khong trang thai quet, khong retention.
   * Khi `PG-05` dong thi cot nay tro thanh khoa ngoai tro toi chung tu that.
   */
  readonly evidenceLocator: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

/** KY QUYET TOAN QUY cua MOT so quy. Khong chong lap voi ky khac cua cung so quy. */
export interface DriverFundPeriod {
  readonly id: string;
  readonly accountId: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: FundPeriodStatus;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * ANH CHUP luc dong ky — APPEND-ONLY, mot hang moi lan dong.
 *
 * Mot ky co the dong, mo lai, roi dong lai. Ghi de anh cu se xoa mat "con so da bao cao lan
 * truoc" — dung thu ma nguoi doi soat can khi ho hoi "vi sao bao cao thang truoc khac?".
 *
 * `GD-11`/T1 §7.3: dong ky KHONG tao but toan. Bang nay khong nam trong so cai, va tong cua no
 * khong bao gio duoc cong vao so du.
 */
export interface FundPeriodSnapshot {
  readonly id: string;
  readonly periodId: string;
  /** Lan chup thu may cua ky nay, tu 1. */
  readonly sequence: number;
  /** So du truoc ngay dau ky. */
  readonly openingBalance: number;
  /** Tong but toan trong ky. */
  readonly periodNet: number;
  /** `openingBalance + periodNet`. Duoc phep AM — hat giong `FUND-003`. */
  readonly closingBalance: number;
  readonly entryCount: number;
  readonly currencyCode: string;
  readonly takenAt: string;
  readonly takenBy: string;
}

/**
 * KHUNG NHIN so quy: so du TINH RA + lich su. Khong phai mot bang.
 *
 * `account` NULLABLE co chu dich. Mot lai xe chua co giao dich nao thi chua co hang so quy nao — va
 * duong DOC khong duoc tao no ra. Neu `driverFundStatement()` goi `ensureAccount()` cho tien thi
 * mot lan `GET` se ghi mot hang vao DB: mot tac dung phu khong ai doc ten ham ma doan ra, va no lam
 * cau "tang doc khong ghi gi" thanh mot cau khong dung.
 *
 * Nen o day: khong co so quy => `account = null`, `balance = 0`, `entries = []`. Hang so quy duoc
 * tao o duong GHI dau tien (tam ung, khoan chi tu quy, mo ky) — dung noi no thuoc ve.
 */
export interface DriverFundStatement {
  readonly account: DriverFundAccount | null;
  readonly driverId: string;
  readonly balance: number;
  readonly currencyCode: string;
  readonly entries: readonly DriverFundEntry[];
}

/** KHUNG NHIN gia thanh chuyen. KHONG mang doanh thu — do la be mat cua `transport-core`. */
export interface TripCostBreakdown {
  readonly tripId: string;
  readonly currencyCode: string;
  readonly directCost: number;
  readonly expenses: readonly TripExpense[];
}
