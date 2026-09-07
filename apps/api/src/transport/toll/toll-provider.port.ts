import type { BusinessDate } from '../business-date.js';

/**
 * CONG NHA CUNG CAP ETC / PHI DUONG BO — `TX-08` (Lane D, Issue #237, tranche `R7`).
 *
 * ===========================================================================
 * TEP NAY LA MOT HOP DONG, KHONG PHAI MOT TINH NANG.
 *
 * `R7` cua #232 va #237 deu noi cung mot cau: *"Research/integration-contract only until B's actual
 * VETC/ePass workflow is known. Do not invent settlement policy."* Nen o day co dung: mot bo KIEU
 * mo ta hinh dang du lieu nha cung cap phat ra, va mot lop truu tuong de doc no.
 *
 * KHONG co kho, KHONG co bang, KHONG co migration, va KHONG duoc dang ky o `app-composition.ts`.
 * Dang ky mot capability rong se lam khach nhin thay mot muc "ETC" khong lam gi — dung kieu loi hua
 * sai ma `F-09` da day.
 *
 * Nghien cuu day du (nguon, ngay, so hieu nghi dinh): `docs/kien-truc/transport-etc-toll.md`.
 *
 * ===========================================================================
 * BA DIEU CONG NAY CO Y KHONG LAM:
 *
 *   1. KHONG HACH TOAN. Moi thu doc ra deu la `...Candidate` — cung quy uoc voi trich xuat chung tu
 *      cua `TX-04`: du lieu nha cung cap la UNG VIEN, khong phai su that tai chinh, cho toi khi mot
 *      con nguoi doi soat.
 *   2. KHONG CHAM SO QUY LAI XE. #229 §8 va #237 deu chot ETC la CONG TY TRA. Khong mot kieu nao
 *      trong tep nay co truong `driverId`, va do la mot bat bien CAU TRUC — xem
 *      `TollNeverTouchesDriverFund` o cuoi tep.
 *   3. KHONG QUYET DOI SOAT. Khong co `match()`, khong co `settle()`, khong co `Dispute`. Chua do
 *      duoc quy trinh khieu nai nao cua hai nha cung cap (xem §6 tai lieu nghien cuu), va mot mo
 *      hinh khieu nai bia ra se dinh hinh sai ca luong xu ly khi B mo ta quy trinh that.
 */

/**
 * DUONG DU LIEU VAO — bon, va thu tu nay la thu tu TIN CAY GIAM DAN, khong phai thu tu uu tien
 * hien thuc.
 *
 * `API` dung dau danh sach vi no la dang giau nhat, NHUNG (do 08/09/2026) khong nha cung cap nao
 * cong bo tai lieu API. No la mot cho GIU CHO. Duong thuc te nhat hom nay la `STATEMENT_FILE`.
 *
 * `MANUAL` khong bao gio duoc bo: mot tram moi mo, mot thang cong khach hang hong, mot chiec xe
 * chay tuyen la — bao gio cung co mot dong khong tu dong vao duoc.
 */
export const TOLL_SOURCE_KINDS = ['API', 'STATEMENT_FILE', 'INVOICE_PDF', 'MANUAL'] as const;
export type TollSourceKind = (typeof TOLL_SOURCE_KINDS)[number];

/**
 * NHA CUNG CAP. Hai gia tri do duoc + mot cho cho khach dung nha khac.
 *
 * KHONG dat ten theo ung dung ("VETC app"): phap nhan la thu ky hop dong, va `docs/.../etc-toll.md`
 * §2 ghi ro hai phap nhan do.
 */
export const TOLL_PROVIDERS = ['VETC', 'EPASS', 'OTHER'] as const;
export type TollProvider = (typeof TOLL_PROVIDERS)[number];

/**
 * LOAI MOT DONG tren sao ke/hoa don. DE NGO co chu dich.
 *
 * `ACCOUNT_FEE` nam o day thay vi thanh mot cot rieng, va do la bai hoc truc tiep tu chuyen phi
 * 6.600d/thang: no duoc cong bo 01/08/2026 roi bi tam dung ~20/08/2026 (tai lieu nghien cuu §5).
 * Mot cot rieng cho mot dong phi co the bien mat trong ba tuan la mot cot chet.
 */
export const TOLL_TRANSACTION_KINDS = ['TOLL_PASS', 'TOP_UP', 'ACCOUNT_FEE', 'ADJUSTMENT'] as const;
export type TollTransactionKind = (typeof TOLL_TRANSACTION_KINDS)[number];

/**
 * MOT TAI KHOAN GIAO THONG — khai niem CO DINH NGHIA PHAP LY (ND 119/2024/ND-CP, Luat Duong bo
 * D.43), khong phai ten thuong mai cua mot ung dung.
 *
 * `vehiclePlates` la mot MANG, va do la ca diem: mot tai khoan doanh nghiep lien ket NHIEU xe (tai
 * lieu nghien cuu §3.1). Mot mo hinh `1 tai khoan = 1 xe` se sai ngay voi khach dau tien.
 */
export interface TollAccountCandidate {
  readonly provider: TollProvider;
  /** So tai khoan giao thong do nha cung cap cap. */
  readonly accountNo: string;
  /** Ten chu tai khoan DUNG NHU tren sao ke — chua doi chieu voi phap nhan nao cua ta. */
  readonly holderName: string | null;
  /** Bien so cac xe dang lien ket. BIEN SO la khoa noi duy nhat do duoc voi doi xe cua ta. */
  readonly vehiclePlates: readonly string[];
}

/**
 * MOT DONG GIAO DICH doc tu nha cung cap. `Candidate` — chua phai su that tai chinh.
 *
 * `passedAt` va `businessDate` la HAI thu khac nhau, va gop chung lai la mot loi da co ten trong
 * repo nay (`business-date.ts`): mot luot qua tram 23:40 ngay 31/8 theo gio Viet Nam duoc luu
 * `2026-08-31T16:40Z`, va doc theo UTC se xep no sang THANG TRUOC. Nen ngay nghiep vu duoc tinh MOT
 * LAN, o tang doc, theo mui gio tenant.
 */
export interface TollTransactionCandidate {
  readonly provider: TollProvider;
  readonly accountNo: string;
  readonly kind: TollTransactionKind;
  /** Bien so tren dong sao ke. `null` o dong khong gan xe (nap tien, phi tai khoan). */
  readonly vehiclePlate: string | null;
  /** Khoanh khac xe qua tram, theo nha cung cap. `null` khi dong khong phai mot luot qua tram. */
  readonly passedAt: string | null;
  /** `INV-25` — NGAY nghiep vu, tinh MOT LAN luc doc theo mui gio tenant. */
  readonly businessDate: BusinessDate;
  /** So nguyen DONG (`GD-03`). CO DAU: luot qua tram duong, nap tien am hay duong tuy quy uoc nguon. */
  readonly signedAmount: number;
  readonly currencyCode: string;
  /** Tram thu phi, dung nhu nha cung cap ghi. Chua chuan hoa ve mot danh muc nao cua ta. */
  readonly stationLabel: string | null;
  /** So hoa don/tham chieu cua nha cung cap — nua dau cua khoa chong ghi trung o tang sau. */
  readonly reference: string | null;
  /**
   * NOI DUNG THO cua dong nguon, giu nguyen.
   *
   * Bat buoc, khong tuy chon: khi mot phep doc ra sai so, thu duy nhat tra loi duoc "nha cung cap
   * that su gui gi" la chinh dong goc. Bo no di la bo mat duong lan vet.
   */
  readonly raw: string;
}

/** KET QUA mot lan doc — kem nhung dong KHONG doc duoc, chu khong nuot chung. */
export interface TollImportCandidate {
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  /** Ten tep / ma ky sao ke — de nguoi doi soat biet con so nay tu dau ra. */
  readonly sourceLabel: string;
  readonly accounts: readonly TollAccountCandidate[];
  readonly transactions: readonly TollTransactionCandidate[];
  /**
   * Dong KHONG doc duoc, kem so dong va ly do.
   *
   * PHAI co mat trong ket qua chu khong duoc nem: mot bang ke 400 dong doc duoc 397 dong la mot
   * ket qua BINH THUONG, va ba dong con lai phai co nguoi nhin. Nem ca lan doc di se lam nguoi
   * dung mat ca 397 dong dung.
   */
  readonly rejected: readonly TollImportRejection[];
}

export interface TollImportRejection {
  readonly line: number;
  readonly reason: TollImportRejectionReason;
  readonly raw: string;
}

/** N duong tu choi thi N ma — khong gop thanh mot `boolean` (`.claude/rules`). */
export const TOLL_IMPORT_REJECTION_REASONS = [
  'TOLL_ROW_UNPARSEABLE',
  'TOLL_ROW_MISSING_AMOUNT',
  'TOLL_ROW_MISSING_DATE',
  'TOLL_ROW_DATE_INVALID',
  'TOLL_ROW_PLATE_MISSING',
  /** Dong co dang hop le nhung loai giao dich khong nhan ra — nha cung cap them mot loai moi. */
  'TOLL_ROW_KIND_UNKNOWN',
] as const;
export type TollImportRejectionReason = (typeof TOLL_IMPORT_REJECTION_REASONS)[number];

/**
 * CONG DOC DU LIEU ETC — trung tinh ve nha cung cap.
 *
 * MOT ham doc, khong co ham ghi. Do la toan bo pham vi ma #237 cho phep o tranche nay.
 *
 * `parse()` nhan mot `Buffer` va noi ro `sourceKind`: cung mot nha cung cap phat ra CSV, XLSX va
 * PDF voi ba hinh dang khac han, nen mot ham `import(file)` doan lay dinh dang se doan sai lang le
 * o dinh dang thu ba.
 */
export abstract class TollProviderPort {
  abstract readonly provider: TollProvider;

  /** Duong nao cong nay thuc su doc duoc. `API` hom nay rong o moi hien thuc. */
  abstract readonly supports: readonly TollSourceKind[];

  abstract parse(input: {
    readonly sourceKind: TollSourceKind;
    readonly sourceLabel: string;
    readonly content: Buffer;
  }): Promise<TollImportCandidate>;
}

/**
 * KIEM MOT BAT BIEN BANG KIEU, khong bang ky luat.
 *
 * `never` o day la co y: neu mot ngay nao do ai them `driverId` vao mot trong ba kieu tren, kieu
 * nay khong con la `never`, va bai test khang dinh dieu do se do. Do la cach re nhat de giu cau
 * "ETC khong bao gio vao so quy lai xe" thanh mot dieu kien BIEN DICH thay vi mot cau trong tai
 * lieu.
 */
export type TollNeverTouchesDriverFund =
  | Extract<keyof TollAccountCandidate, 'driverId'>
  | Extract<keyof TollTransactionCandidate, 'driverId'>
  | Extract<keyof TollImportCandidate, 'driverId'>;
