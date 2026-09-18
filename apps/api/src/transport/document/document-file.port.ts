/**
 * CONG TEP HEP cua chung tu van hanh — `#279` O2.
 *
 * ============================================================================================
 * TAI SAO CONG NAY TON TAI TRUOC KHI CO NEN TANG TEP
 * ============================================================================================
 *
 * `#287`/Lane P so huu Nen tang Tep dung nghia: ma tep on dinh, vong doi, ACL, kiem toan, luu tru
 * doi nha cung cap. No CHUA vao `main` — do la mot su that da do luc lane nay bat dau, khong phai
 * mot phong doan.
 *
 * Quy tac song song cua `#279` chi dung mot duong di trung thuc:
 *
 *     *"implement pure domain/document/waiting/UX contracts against a narrow file port;
 *       continue non-file slices; do NOT create a temporary Transport blob table."*
 *
 * Nen day la cong do. Khi `#287` duoc chap nhan tren `main`, thu duy nhat phai doi la MOT dong
 * buoc adapter trong `transport-document.module.ts` — khong mot luat mien nao, khong mot bang nao,
 * khong mot bai test nghiep vu nao. Cung khuon `AcceptanceEvidenceFacts` cua Lane K, va do la co y:
 * chinh Lane K da chung minh khuon nay chay duoc.
 *
 * ============================================================================================
 * KHONG MOT DINH VI THO NAO DI QUA DAY
 * ============================================================================================
 *
 * `#279` O2: *"store stable opaque File IDs, never raw GCS/S3/local locator in public DTO"*.
 *
 * Cong nay nhan mot `fileId` va tra ve mot MO TA — khong `bucket`, khong `key`, khong `path`,
 * khong mot URL nao. Mot mien nghiep vu khong co viec gi phai biet byte nam o dau, va cach chac
 * chan nhat de giu dieu do la khong co duong nao de hoi.
 *
 * ============================================================================================
 * `knowing File ID != permission to read File`
 * ============================================================================================
 *
 * `#287` P2 phat bieu dieu do, va cong nay ton trong no theo ca hai chieu: no nhan `authUserId` de
 * ben tra loi tu quyet dinh, va no KHONG tra ve gi ngoai mot mo ta khi tu choi. Mot ma tep nguoi
 * dung go bua vao khong duoc bien thanh mot chung tu hop le, va cung khong duoc de lo rang no CO
 * ton tai o cho khac.
 */

/** Vong doi cua mot tep, nhin tu ben ngoai. Ten CU THE do `#287` P3 chot; day la ban toi thieu. */
export const DOCUMENT_FILE_STATES = ['ACTIVE', 'WITHDRAWN', 'QUARANTINED'] as const;
export type DocumentFileState = (typeof DOCUMENT_FILE_STATES)[number];

/**
 * MO TA mot tep — du de mot chung tu tro toi no, KHONG hon.
 *
 * KHONG co `locator`, `bucket`, `key`, `url`, `path`. `document-file-port.spec.ts` khoa dieu do
 * bang mot bai doc chinh ma nguon: mot truong nhu vay them vao day se do ngay.
 */
export interface DocumentFileFacts {
  readonly fileId: string;
  readonly state: DocumentFileState;
  readonly contentType: string;
  readonly byteSize: number;
}

/**
 * KET QUA mot lan hoi — mot UNION CO NHAN, khong mot `null`.
 *
 * Ba nhanh, va moi nhanh la mot viec KHAC HAN ma nguoi dung phai lam:
 *
 *   · `AVAILABLE`   — tep co that, dang hoat dong, va nguoi goi duoc phep gan no;
 *   · `UNAVAILABLE` — nen tang tep CHUA co tren ban nay. Khong phai loi cua ai; duong chung tu
 *     giay (`EXTERNAL_PHYSICAL`) van di duoc, va do la duong DUNG cho hom nay;
 *   · `DENIED`      — co nen tang tep, va cau tra loi la KHONG. Gop no vao `UNAVAILABLE` se lam
 *     mot lan tu choi quyen doc giong het mot he thong chua lap xong.
 */
export type DocumentFileLookup =
  | { readonly kind: 'AVAILABLE'; readonly file: DocumentFileFacts }
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'DENIED'; readonly reason: DocumentFileDenialReason };

export const DOCUMENT_FILE_DENIAL_REASONS = [
  /** Ma khong ton tai, HOAC khong thuoc pham vi nguoi goi. MOT ma cho ca hai — xem chu thich. */
  'FILE_NOT_AVAILABLE_TO_CALLER',
  /** Tep da bi rut hoac bi cach ly. `#279` O2: khong duoc lang le thoa man mot lan nghiem thu. */
  'FILE_NOT_ACTIVE',
] as const;
export type DocumentFileDenialReason = (typeof DOCUMENT_FILE_DENIAL_REASONS)[number];

/**
 * CONG. Mot ham, mot cau hoi.
 *
 * `FILE_NOT_AVAILABLE_TO_CALLER` co y GOP hai tinh huong — "khong co" va "khong phai cua ban" —
 * thanh MOT ma. Tach chung se bien cong nay thanh mot may do su ton tai: mot nguoi thu lan luot
 * cac ma se doc duoc "ma nay co that nhung khong phai cua toi", tuc dung dieu `#287` P6 goi la
 * *"fails closed without useful enumeration"*.
 */
export abstract class TransportDocumentFilePort {
  abstract describe(fileId: string, authUserId: string): Promise<DocumentFileLookup>;

  /**
   * GAN tep vao mot chung tu VUA DUOC GHI — `#287` P2/P11.
   *
   * ============================================================================================
   * VI SAO PHAI LA MOT PHEP THU HAI, khong gop vao `describe()`
   * ============================================================================================
   *
   * `describe()` chay TRUOC khi hang chung tu ton tai — luc do chua co `documentId` de gan vao.
   * Nen mot lan gan chi thuc hien duoc SAU `create()`, va gop hai viec vao mot ham se bien mot cau
   * hoi thanh mot lenh ghi.
   *
   * ============================================================================================
   * VI SAO MOT LIEN KET LA BAT BUOC, khong phai mot cot `fileId` la du
   * ============================================================================================
   *
   * Cot `fileId` noi duoc "to nay la tep nao". No KHONG noi duoc "ai duoc xem tep nay" — va do moi
   * la cau ma nen tang tep phai tra loi khi ke toan mo mot to bien nhan. Khong co lien ket, tep chi
   * co nguoi tai len doc duoc (`#287` P2), tuc ke toan se khong mo duoc chinh cai ho dang doi
   * soat.
   *
   * KHONG NEM. Mot lan gan hong khong duoc lam hong ca lan ghi chung tu: to giay VAN da duoc chup,
   * va hang chung tu VAN dung. Duong hong o day lam tep tro ve pham vi cua rieng nguoi tai len —
   * mot trang thai nghiep vu chat hon, khong long hon.
   */
  abstract bind(fileId: string, documentId: string, authUserId: string): Promise<void>;
}

/**
 * ADAPTER MAC DINH khi chua co Nen tang Tep nao tren `main`.
 *
 * Tra ve `UNAVAILABLE` cho MOI ma, va do la cau tra loi DUNG chu khong phai mot cho trong: hom nay
 * B that su chi co ban giay, va `#279` O7 doi rang duong giay do phai di duoc *"using an auditable
 * external-physical basis rather than a fake file"*.
 *
 * Cai KHONG duoc lam o day: tra ve `AVAILABLE` de "cho no chay duoc". Lam vay se bien mot ma bat
 * ky nguoi dung go vao thanh mot chung tu hop le — tuc dung lo hong ma `#279` O12 (*"foreign/unknown
 * File IDs fail closed"*) ton tai de chan. Cung ly le, va cung hinh dang, voi
 * `NoOperationalDocumentsAdapter` ma Lane K da viet cho chieu nguoc lai.
 */
export class NoFilePlatformAdapter extends TransportDocumentFilePort {
  async describe(): Promise<DocumentFileLookup> {
    return { kind: 'UNAVAILABLE' };
  }

  /**
   * KHONG LAM GI, va khong bao gio duoc goi.
   *
   * `describe()` o ban nay tra `UNAVAILABLE` cho MOI ma, nen `OperationalDocumentService` khong bao
   * gio ghi duoc mot chung tu co `fileId`. Than ham rong la HE QUA cua dieu do chu khong mot cho
   * trong — va no van phai ton tai de ban khong-co-nen-tang-tep thoa man cung mot cong.
   */
  async bind(): Promise<void> {}
}
