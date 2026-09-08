import type { BusinessDate } from '../business-date.js';
import type {
  TollProvider,
  TollSourceKind,
  TollTransactionKind,
} from './toll-provider.port.js';

/**
 * KIEU LUU TRU cua nap du lieu ETC — `TX-08` mo rong (Lane J, #269).
 *
 * Ba kieu goc (`TollProvider`, `TollSourceKind`, `TollTransactionKind`) duoc NHAP LAI tu
 * `toll-provider.port.js` chu khong dinh nghia lai. #269 J1 noi ro: *"If the current port already
 * expresses these correctly, consume it; do not rename/rebuild for style."*
 */

/* ====================================================================== *
 * TAI KHOAN GIAO THONG va ANH XA XE
 * ====================================================================== */

/**
 * MOT TAI KHOAN GIAO THONG da khai trong he thong.
 *
 * Khac `TollAccountCandidate` cua cong nha cung cap: cai kia la thu DOC RA TU MOT TEP, cai nay la
 * thu NGUOI DA KHAI. Mot ban ghi o day khong bao gio duoc sinh tu dong tu mot lan nhap tep — cung
 * quy uoc voi `UNKNOWN_VEHICLE` cua nhien lieu, va vi mot ly do manh hon: so tai khoan doc sai mot
 * chu se lang le tao ra mot tai khoan ma khong ai so sach nao biet.
 */
export interface TollAccount {
  readonly id: string;
  readonly provider: TollProvider;
  /** So tai khoan DUNG NHU nha cung cap cap. */
  readonly accountNo: string;
  /** Ten chu tai khoan. ND 119 Phu luc cho phep CA NHAN lan TO CHUC dung ten. */
  readonly holderName: string | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Ban ghi noi den TU DAU — de nguoi doc biet dong nay do ai khai hay do tep noi. */
export const TOLL_LINK_PROVENANCE = ['MANUAL', 'STATEMENT_DECLARED'] as const;
export type TollLinkProvenance = (typeof TOLL_LINK_PROVENANCE)[number];

/**
 * MOT DOAN THOI GIAN mot xe nhan chi tra tu mot tai khoan giao thong.
 *
 * ===========================================================================
 * VI SAO LA MOT LICH SU CO HIEU LUC, KHONG PHAI MOT BANG NOI TU DO:
 *
 * ND 119/2024/ND-CP Dieu 11 khoan 3 — *"moi phuong tien tham gia giao thong CHI DUOC NHAN CHI TRA
 * TU MOT TAI KHOAN GIAO THONG"*. Do la mot rang buoc PHAP LY, khong phai mot lua chon cua ta.
 *
 * Nen tai moi khoanh khac, mot `vehicleId` chi duoc co DUNG MOT dong `effectiveTo === null`. "Xe
 * doi tai khoan" la DONG dong cu roi MO dong moi — khong bao gio la them mot dong thu hai.
 *
 * Bat bien do duoc giu bang MOT UNIQUE INDEX BO PHAN trong Postgres, khong bang mot lan kiem o
 * tang mien: kiem o tang mien chi dung khi co MOT nguoi ghi.
 */
export interface TollAccountVehicleLink {
  readonly id: string;
  readonly accountId: string;
  readonly vehicleId: string;
  /**
   * Tham chieu xe theo nha cung cap — ND 119 Phu luc co "ma dinh danh the dau cuoi" (RFID), mot
   * khoa BEN HON bien so.
   *
   * `null` duoc phep va la truong hop THUONG: chua do duoc ma do co xuat hien tren tep xuat hay
   * khong (`transport-etc-ingestion.md` §2.3, muc `UNKNOWN`). Chua cho no la mot cot BAT BUOC vi
   * mot cot bat buoc cho mot du kien chua chac ton tai se chan moi lan nhap.
   */
  readonly providerVehicleRef: string | null;
  readonly effectiveFrom: BusinessDate;
  /** `null` = dang hieu luc. DUNG MOT dong nhu vay cho mot xe (xem khoi tren). */
  readonly effectiveTo: BusinessDate | null;
  readonly provenance: TollLinkProvenance;
  readonly createdAt: Date;
  readonly createdBy: string;
}

/* ====================================================================== *
 * NGUON NAP va DONG UNG VIEN
 * ====================================================================== */

/**
 * MOT LAN NAP — bat bien sau khi ghi.
 *
 * `sourceDigest` la SHA-256 cua BYTE goc, va `unique(provider, sourceDigest)` la ca co che chong
 * lap o tang NGUON: nap lai dung bo byte do tra ve chinh ban ghi nay, khong tao gi.
 */
export interface TollImport {
  readonly id: string;
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  /** Ten tep / ma ky sao ke — de nguoi doi soat tim lai ban goc. KHONG phai duong dan he thong tep. */
  readonly sourceLabel: string;
  readonly sourceDigest: string;
  /** Ky cua nguon NEU nguon co mot ky. Hoa don tung giao dich thi khong co. */
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly importedAt: Date;
  readonly importedBy: string;
}

export const TOLL_CANDIDATE_PARSE_STATUSES = ['ACCEPTED', 'REJECTED'] as const;
export type TollCandidateParseStatus = (typeof TOLL_CANDIDATE_PARSE_STATUSES)[number];

/**
 * PHAN LOAI mot dong DA DOC DUOC. Dong bi tu choi luc doc KHONG co trang thai nay (`null`).
 *
 * ===========================================================================
 * VI SAO KHONG CO `OUT_OF_POLICY`:
 *
 * #269 J6 cho phep no *"only if a real deterministic policy exists"*. Khong ton tai. Chua ai mo ta
 * chinh sach nao noi mot luot qua tram la "ngoai chinh sach", va bia ra mot cai se dinh hinh sai
 * ca luong xu ly khi B mo ta quy trinh that.
 *
 * `UNSUPPORTED_KIND` cung khong o day: mot dong co loai giao dich khong nhan ra thi hong o tang
 * DOC (`TOLL_ROW_KIND_UNKNOWN`), khong phai o tang PHAN LOAI. Mot ma o ca hai cho la mot ma se
 * lech nhau.
 */
export const TOLL_MATCH_STATES = [
  'MATCHED',
  'ACCOUNT_UNRESOLVED',
  'VEHICLE_UNRESOLVED',
  'AMBIGUOUS',
  'DUPLICATE_CANDIDATE',
] as const;
export type TollMatchState = (typeof TOLL_MATCH_STATES)[number];

/**
 * TRANG THAI DOI SOAT cua mot dong.
 *
 * KHONG co `PAID`, `SETTLED` hay `ACCOUNTED` — #269 J7 cam thang. Ba chu do noi ve TIEN DA TRA;
 * cai duy nhat lane nay biet la mot dong da co nguoi NHIN va noi no khop hay khong.
 */
export const TOLL_REVIEW_STATES = ['PENDING', 'CONFIRMED', 'REOPENED'] as const;
export type TollReviewState = (typeof TOLL_REVIEW_STATES)[number];

/** Viec nguoi doi soat lam duoc. Moi viec la MOT dong lich su, khong ghi de dong truoc. */
export const TOLL_REVIEW_ACTIONS = [
  'RESOLVE_VEHICLE',
  'CONFIRM',
  'FLAG_DUPLICATE',
  /**
   * "Hai dong giong nhau nay la HAI su kien that."
   *
   * Nghe nhu mot truong hop hiem, nhung VETC TU CONG BO no: loi doc cheo lan sinh ra hai giao dich
   * cho mot luot xe, roi he thong hoan mot giao dich. Nguoi doi soat phai noi duoc dieu do ra, va
   * he thong phai ghi lai — neu khong thi lan chay so khop sau se lai gan cho no cai nhan cu.
   */
  'CLEAR_DUPLICATE',
  'REOPEN',
] as const;
export type TollReviewAction = (typeof TOLL_REVIEW_ACTIONS)[number];

/**
 * MOT DONG cua nguon, da luu.
 *
 * Dong BI TU CHOI van duoc luu, voi cac o so lieu de `null` va mot ly do co ma. #269 J3 goi do la
 * *"preserve partial success"*: mot tep 500 dong doc duoc 497 la ket qua BINH THUONG, va nem ca
 * lan nap di se lam nguoi dung mat ca 497 dong dung — roi ho se khong bao gio biet ba dong kia
 * ton tai.
 */
export interface TollTransactionCandidateRecord {
  readonly id: string;
  readonly importId: string;
  readonly provider: TollProvider;
  /** So dong TRONG TEP, tu 1 — de nguoi doi soat mo tep ra tim dung dong. */
  readonly rowNumber: number;
  readonly parseStatus: TollCandidateParseStatus;
  /** Ly do tu choi luc DOC. `null` o dong doc duoc. */
  readonly rejectReason: string | null;
  /** So tai khoan DOC DUOC TU TEP, giu nguyen ke ca khi khong ung tai khoan nao. */
  readonly accountNoRaw: string;
  readonly accountId: string | null;
  readonly kind: TollTransactionKind | null;
  /** Bien so DOC DUOC TU TEP, giu nguyen ke ca khi khong khop xe nao. */
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  /** Khoanh khac qua tram theo nha cung cap. `null` o dong khong phai luot qua tram. */
  readonly passedAt: Date | null;
  /** `INV-25` — NGAY nghiep vu, tinh MOT LAN luc doc theo mui gio tenant. */
  readonly businessDate: BusinessDate | null;
  /** So nguyen DONG (`GD-03`), CO DAU. `null` o dong bi tu choi vi so tien hong. */
  readonly signedAmount: number | null;
  readonly currencyCode: string;
  readonly stationLabel: string | null;
  /** So hoa don / tham chieu cua nha cung cap, neu tep co. Thuong khong co. */
  readonly providerRef: string | null;
  /**
   * DAU VAN cua dong — khoa chong lap o tang DONG.
   *
   * KHONG phai mot khoa DUY NHAT: #269 J4 cam bia ra mot luat duy nhat cho `providerReference` khi
   * khong nha cung cap nao bao dam co mot cai. Dung van chi la mot TIN HIEU de nguoi xem, xem
   * `TOLL_DUPLICATE_CANDIDATE`.
   */
  readonly fingerprint: string | null;
  readonly matchState: TollMatchState | null;
  readonly reviewState: TollReviewState;
  /** Dong nguyen ban, de doi chieu khi ai do nghi bo cot dang doc sai tep. */
  readonly rawValues: Readonly<Record<string, string>>;
  readonly createdAt: Date;
}

/**
 * MOT QUYET DINH cua nguoi doi soat — GHI THEM, khong bao gio ghi de.
 *
 * `previousVehicleId`/`nextVehicleId` giu ca hai dau cua mot lan sua, nen mot lan gan nham xe van
 * doc nguoc lai duoc. #269 J7: *"old/new candidate linkage; append/supersede history"*.
 */
export interface TollReviewDecisionRecord {
  readonly id: string;
  readonly candidateId: string;
  readonly action: TollReviewAction;
  readonly actor: string;
  readonly at: Date;
  /** Ly do CO MA — khong phai mot cau tu do. */
  readonly reason: string;
  /** Ghi chu cua nguoi quyet. Tuy chon, va KHONG thay the `reason`. */
  readonly note: string | null;
  readonly previousVehicleId: string | null;
  readonly nextVehicleId: string | null;
  readonly previousMatchState: TollMatchState | null;
  readonly nextMatchState: TollMatchState | null;
  /** Dong ma nguoi doi soat noi dong nay trung — chi co o `FLAG_DUPLICATE`. */
  readonly duplicateOfCandidateId: string | null;
}

/**
 * ETC KHONG BAO GIO CHAM SO QUY LAI XE — giu bang KIEU, khong bang ky luat.
 *
 * Song doi cua `TollNeverTouchesDriverFund` o `toll-provider.port.ts`, va mo rong cho cac kieu LUU
 * TRU ma lane J them vao. Neu mot ngay ai do them `driverId` vao mot trong bon kieu duoi day,
 * kieu nay thoi la `never` va bai test khang dinh dieu do se do — TRUOC khi mot dong phi duong bo
 * kip di vao so quy lai xe.
 *
 * #229 §8 va #237 deu chot: ETC la CONG TY TRA.
 */
export type TollStorageNeverTouchesDriverFund =
  | Extract<keyof TollAccount, 'driverId'>
  | Extract<keyof TollAccountVehicleLink, 'driverId'>
  | Extract<keyof TollImport, 'driverId'>
  | Extract<keyof TollTransactionCandidateRecord, 'driverId'>;
