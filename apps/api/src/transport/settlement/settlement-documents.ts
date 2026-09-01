import type { BusinessDate } from '../business-date.js';
import type {
  SettlementCounterpartyKind,
  SettlementDirection,
  SettlementFlow,
} from './settlement-flows.js';

/**
 * NGU NGHIA CHUNG TU QUYET TOAN — ham THUAN: chong ghi trung, va sua bang cach ghi them.
 *
 * ===========================================================================
 * VI SAO CO MOT VAN TAY THU HAI TRONG REPO NAY.
 *
 * `costing-replay.ts` cua `TX-03` co mot `fingerprintOf` gan y het — nhung no la `const` KHONG
 * export, thuoc capability `transport-costing`. Dung lai no doi hoi mo rong be mat cong khai cua
 * mot capability DA DONG de phuc vu mot capability moi. Cai gia cua viec do (hai capability dinh
 * vao nhau, T3 co them mot API chi T5 goi) lon hon cai gia cua hai dong `JSON.stringify` lap lai.
 *
 * Trung lap o day la CO Y va co bien gioi: neu mot ngay nao do co ba noi can, thi cho dung cua no
 * la Platform Track, khong phai mot trong ba mien tu nhan lam chu.
 *
 * ===========================================================================
 * HAI NUA CUA CHONG GHI TRUNG — thieu nua nao cung hong theo mot kieu rieng.
 *
 *   · KHOA `(sourceContext, sourceId)` — mot su kien kinh te sinh DUNG mot chung tu goc, du duong
 *     goi chay lai bao nhieu lan;
 *   · VAN TAY noi dung — cung khoa ma khac noi dung la LOI BEN GOI, phai nem.
 *
 * Tra ve ban cu khi noi dung da doi se lam ben goi tin rang con so MOI cua ho da duoc ghi. Do la
 * bai hoc T4R §2 va §5, va o day no dat hon: mot chung tu quyet toan la mot khoan tien phai tra.
 */

export const SETTLEMENT_DOCUMENT_KINDS = ['ORIGINAL', 'ADJUSTMENT', 'REVERSAL'] as const;
export type SettlementDocumentKind = (typeof SETTLEMENT_DOCUMENT_KINDS)[number];

export const SETTLEMENT_DOCUMENT_STATUSES = ['POSTED', 'REVERSED'] as const;
export type SettlementDocumentStatus = (typeof SETTLEMENT_DOCUMENT_STATUSES)[number];

/**
 * NGUON sinh ra mot chung tu — nua dau cua khoa chong ghi trung.
 *
 * Mot HANG SO CO KIEU chu khong phai chuoi tu do: `sourceContext` la thu duy nhat phan biet
 * "chuyen 123 da doi soat" voi "chuyen 123 co cong no nha xe". Neu no la `string`, hai duong ghi
 * khac nhau co the vo tinh dung cung mot chuoi va lan thu hai se bi coi la mot lan chay lai — tuc
 * mot khoan tien khong bao gio duoc ghi.
 */
export const SETTLEMENT_SOURCE_CONTEXTS = [
  /** Chuyen chuyen sang `RECONCILED` -> ghi nhan doanh thu khach. `sourceId` = tripId. */
  'TRIP_RECONCILED',
  /** Chuyen thue xe ngoai -> cong no nha xe. `sourceId` = tripId. */
  'TRIP_CARRIER_COST',
  /** Chuyen doi tac mang don -> hoa hong. `sourceId` = tripId. */
  'TRIP_COMMISSION',
  /** Ban giao cua `TX-04` -> cong no cay xang. `sourceId` = id BAN SUA DOI cua ban giao. */
  'FUEL_SETTLEMENT_HANDOFF',
  /** Ke toan ghi tay mot dieu chinh. `sourceId` = khoa do nguoi nhap dat. */
  'MANUAL_ADJUSTMENT',
] as const;
export type SettlementSourceContext = (typeof SETTLEMENT_SOURCE_CONTEXTS)[number];

/**
 * DANH TINH KINH TE cua mot chung tu — dung nhung truong ma "cung mot chung tu" phu thuoc vao.
 *
 * CO Y NGHEO. `note`, `invoiceRef`, `recordedBy` va `createdAt` KHONG nam trong danh tinh: giu
 * chung lai se bien moi lan chay lai binh thuong (nguoi khac bam, ghi chu go them mot dau cham)
 * thanh mot xung dot — tuc bien lop bao ve thanh nguon su co. Do la bai hoc T4R §5 doc theo chieu
 * nguoc lai: THEM truong doi duong tien, BO truong chi la trang tri.
 *
 * `dueDate` CO nam trong danh tinh: cung so tien nhung khac han thanh toan la hai nghia vu khac
 * nhau voi ke toan, va no doi theo dieu khoan cua khach chu khong theo nguoi bam nut.
 */
export interface SettlementDocumentIdentity {
  readonly direction: SettlementDirection;
  readonly flow: SettlementFlow;
  readonly counterpartyKind: SettlementCounterpartyKind;
  readonly counterpartyId: string;
  readonly kind: SettlementDocumentKind;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly tripId: string | null;
  readonly adjustsId: string | null;
}

const IDENTITY_FIELDS: readonly (keyof SettlementDocumentIdentity)[] = [
  'direction',
  'flow',
  'counterpartyKind',
  'counterpartyId',
  'kind',
  'signedAmount',
  'currencyCode',
  'businessDate',
  'dueDate',
  'tripId',
  'adjustsId',
];

/**
 * VAN TAY — mot chuoi, so bang `===`.
 *
 * Mot chuoi chu khong phai mot chuoi phep so tung truong: khi hai van tay lech nhau, thong diep
 * loi in ra duoc CA HAI ban va nguoi truc thay ngay truong nao khac. Mot `boolean` khong noi
 * duoc gi.
 */
export const settlementDocumentFingerprint = (identity: SettlementDocumentIdentity): string =>
  JSON.stringify(IDENTITY_FIELDS.map((field) => identity[field] ?? null));

export const isSameSettlementDocument = (
  left: SettlementDocumentIdentity,
  right: SettlementDocumentIdentity,
): boolean => settlementDocumentFingerprint(left) === settlementDocumentFingerprint(right);

/**
 * SO TIEN cua mot ban sua, suy tu ban goc va so tien MOI mong muon.
 *
 * `ADJUSTMENT` mang CHENH LECH, khong mang so tuyet doi. Do la thu cho phep doc mot chuoi chung tu
 * bang MOT phep cong duy nhat, thay vi phai biet hang nao la hang "moi nhat" roi bo qua nhung hang
 * truoc — mot phep doc ma bat ky truy van nao quen mot dieu kien deu lam sai.
 *
 * Tra `null` khi khong co gi de sua: ghi mot ban dieu chinh 0 dong khong noi gi ve the gioi, va no
 * lam moi bao cao "so lan phai sua" dem thua. Tang goi bien `null` thanh mot lan phat lai.
 */
export const adjustmentDelta = (
  postedSignedAmount: number,
  desiredSignedAmount: number,
): number | null => {
  const delta = desiredSignedAmount - postedSignedAmount;
  return delta === 0 ? null : delta;
};

/**
 * SO TIEN cua mot ban DAO — doi dau toan bo ban goc.
 *
 * Khac `ADJUSTMENT` o cho no khong hoi "muon thanh bao nhieu": dao la tuyen bo rang ban goc dang
 * le khong ton tai. Sau khi dao, tong cua chuoi bang 0, va ban goc VAN con nguyen noi dung de tra
 * loi cau "truoc do he thong da ghi gi".
 */
export const reversalAmount = (postedSignedAmount: number): number => -postedSignedAmount;

/**
 * MOT BAN GOC CO CON SUA DUOC KHONG.
 *
 * Da bi dao thi khong. Ly do khong phai su sach se: mot ban dieu chinh gan vao hang da dao se lam
 * tong cua chuoi khac 0 ma khong ai co y do do, va no doc len nhu mot khoan no song lai.
 *
 * Chi `ORIGINAL` moi la dich cua mot ban sua: cho phep sua mot ban sua se tao ra mot cay nhieu
 * tang, va cau hoi "rot cuoc khoan nay bao nhieu" se phu thuoc vao thu tu duyet cay.
 */
export const canAdjust = (target: {
  readonly kind: SettlementDocumentKind;
  readonly status: SettlementDocumentStatus;
}): boolean => target.status !== 'REVERSED' && target.kind === 'ORIGINAL';

/**
 * SO DU con lai cua mot chuoi chung tu.
 *
 * `documents` phai la ban goc VA moi ban sua cua no; `allocations` la tong da tra/da thu. Ham nay
 * khong tu doc DB nen no khong the tu quen mot ban sua — trach nhiem do nam o tang kho, va do la
 * cho duy nhat bao dam duoc dieu do trong mot giao dich.
 *
 * `gross >= 0` chon chieu tru: mot chuoi `RECEIVABLE` co tong duong va tien thu ve lam no nho di;
 * mot chuoi `PAYABLE` (tong am theo quy uoc dau cua `signedAmount`) thi tien tra ra lam no tien ve
 * 0 tu phia am. Viet mot cong thuc chung cho ca hai chieu se cho ra dau sai o dung mot ben.
 */
export const outstandingOf = (
  documents: readonly { readonly signedAmount: number }[],
  allocations: readonly { readonly amount: number }[],
): number => {
  const gross = documents.reduce((total, doc) => total + doc.signedAmount, 0);
  const settled = allocations.reduce((total, alloc) => total + alloc.amount, 0);
  return gross >= 0 ? gross - settled : gross + settled;
};
