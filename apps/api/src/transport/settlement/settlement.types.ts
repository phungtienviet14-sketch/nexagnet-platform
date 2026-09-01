import type { BusinessDate } from '../business-date.js';
import type { CommissionCalcKind, CommissionScope } from './commission-rules.js';
import type {
  SettlementDocumentKind,
  SettlementDocumentStatus,
  SettlementSourceContext,
} from './settlement-documents.js';
import type {
  SettlementCounterpartyKind,
  SettlementDirection,
  SettlementFlow,
} from './settlement-flows.js';

/**
 * `TX-05 Settlement` — hinh dang du lieu doc len tu kho.
 *
 * Tach khoi `transport.types.ts` (thuoc `transport-core`) cung ly le voi `costing.types.ts`: mot
 * khach van tai co the bat `transport-core` ma khong bat `transport-settlement`. Tron chung se lam
 * kieu cua cong no co mat trong ban build cua mot khach khong he theo doi cong no.
 */

/**
 * MOT CHUNG TU quyet toan.
 *
 * KHONG co cot `paidAmount` hay `outstandingAmount`. Do la `INV-01` cua `TX-03` doc sang day: so
 * da tra la KET QUA cong don `SettlementAllocation`, khong phai mot o nho. Mot o nho se lech vinh
 * vien ngay lan dau mot loi xay ra giua "ghi phan bo" va "cap nhat so da tra", va khong ai biet
 * ben nao dung. So du duoc tra ve trong `SettlementDocumentChain` — mot KHUNG NHIN.
 */
export interface SettlementDocument {
  readonly id: string;
  readonly direction: SettlementDirection;
  readonly flow: SettlementFlow;
  readonly counterpartyKind: SettlementCounterpartyKind;
  readonly counterpartyId: string;
  readonly kind: SettlementDocumentKind;
  readonly status: SettlementDocumentStatus;
  /** So nguyen dong CO DAU. `ADJUSTMENT` mang chenh lech, co the am. */
  readonly signedAmount: number;
  readonly currencyCode: string;
  /** `INV-25` — ngay GHI NHAN, tinh mot lan luc ghi. */
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly tripId: string | null;
  readonly sourceContext: SettlementSourceContext;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  /** Ban goc ma hang nay sua. `null` o `ORIGINAL`. */
  readonly adjustsId: string | null;
  /** `GD-16` — CHI la so tham chieu, khong phat hoa don dien tu nao. */
  readonly invoiceRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface SettlementAllocation {
  readonly id: string;
  readonly documentId: string;
  /** DUONG. Mot lan tra lai tien la mot `ADJUSTMENT`, khong phai mot phan bo am. */
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly method: string;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

/**
 * KHUNG NHIN mot CHUOI chung tu: ban goc, moi ban sua cua no, va cac lan phan bo.
 *
 * Doc mot nghia vu tien PHAI di qua kieu nay chu khong qua mot `SettlementDocument` don le. Mot
 * hang don doc khong tra loi duoc "rot cuoc con no bao nhieu" — no chi la mot lat cat cua chuoi.
 */
export interface SettlementDocumentChain {
  readonly original: SettlementDocument;
  /** Ban dieu chinh + ban dao, theo thu tu ghi. */
  readonly corrections: readonly SettlementDocument[];
  readonly allocations: readonly SettlementAllocation[];
  /** Tong `signedAmount` cua ban goc va moi ban sua. */
  readonly grossAmount: number;
  /** Con lai sau khi tru phan da tra/da thu. */
  readonly outstandingAmount: number;
}

export const SETTLEMENT_PERIOD_STATUSES = ['OPEN', 'CLOSING', 'CLOSED', 'REOPENED'] as const;
export type SettlementPeriodStatus = (typeof SETTLEMENT_PERIOD_STATUSES)[number];

/**
 * KY QUYET TOAN theo DONG TIEN.
 *
 * `CLOSING` va `CLOSED` deu DONG BANG ky — mot chung tu co ngay nghiep vu roi vao khoang do se bi
 * tu choi. `REOPENED` khong quay ve `OPEN` vi hai trang thai do noi hai dieu khac nhau: mot ky
 * `REOPENED` la ky DA TUNG duoc bao cao ra ngoai.
 */
export interface SettlementPeriod {
  readonly id: string;
  readonly flow: SettlementFlow;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: SettlementPeriodStatus;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerSettlementTerms {
  readonly customerId: string;
  readonly paymentTermDays: number;
  /** `null` = KHONG khai han muc. Khac han `0`. */
  readonly creditLimit: number | null;
  readonly currencyCode: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const COMMISSION_RULE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type CommissionRuleStatus = (typeof COMMISSION_RULE_STATUSES)[number];

/** PHAM VI cua mot luat hoa hong. Con so nam o `CommissionRuleVersion`. */
export interface CommissionRule {
  readonly id: string;
  readonly partnerId: string | null;
  readonly routeKey: string | null;
  readonly status: CommissionRuleStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** MOT BAN cua mot luat — CHI THEM, khong bao gio sua. */
export interface CommissionRuleVersion {
  readonly id: string;
  readonly ruleId: string;
  readonly version: number;
  readonly calcKind: CommissionCalcKind;
  /** Diem co ban: 1% = 100. */
  readonly rateBasisPoints: number | null;
  readonly fixedAmount: number | null;
  readonly effectiveFrom: BusinessDate;
  readonly effectiveTo: BusinessDate | null;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

/**
 * ANH CHUP mot lan tinh hoa hong.
 *
 * Chup lai `calcKind`/`rate`/`fixed` thay vi chi tro `ruleVersionId` la co y: mot chuyen da quyet
 * toan phai doc ra CUNG mot con so mai mai (acceptance 8), va bang luat la thu nguoi dung sua.
 */
export interface CommissionCalculation {
  readonly id: string;
  readonly tripId: string;
  readonly ruleVersionId: string;
  readonly ruleScopeSnapshot: CommissionScope;
  readonly calcKindSnapshot: CommissionCalcKind;
  readonly rateBasisPointsSnapshot: number | null;
  readonly fixedAmountSnapshot: number | null;
  /** Gia cuoc lam CAN CU. Chup lai vi gia cuoc chuyen co the bi sua sau do. */
  readonly basisAmount: number;
  /** Ket qua THO truoc lam tron, dang chuoi thap phan. */
  readonly rawAmount: string;
  readonly resultAmount: number;
  readonly documentId: string | null;
  readonly partnerId: string;
  readonly businessDate: BusinessDate;
  readonly createdAt: string;
}

/**
 * KET QUA mot lan ghi nhan — chung tu, va CO PHAI mot lan phat lai khong.
 *
 * `replayed` tach hai chuyen khac nhau ve the gioi: mot lan ghi that su va mot lan goi lap. Gop
 * lai thi khong ai dem duoc so lan duong tich hop cua khach ghi trung.
 */
export interface SettlementRecognition {
  readonly document: SettlementDocument;
  readonly replayed: boolean;
}
