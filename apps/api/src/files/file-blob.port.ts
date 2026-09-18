import type { FileStorageProvider } from './file.types.js';

/**
 * CONG LUU BYTE cua nen tang tep — `#287` P4.
 *
 * ============================================================================================
 * KHONG PHAI MOT KHO THU HAI
 * ============================================================================================
 *
 * `#287` P4: *"Reuse/wrap current `MediaStore`; do not fork a second GCS/S3/local client stack."*
 * Nen cong nay la mot LOP BOC, khong mot he thong luu tru moi: hien thuc duy nhat
 * (`MediaFileBlobStore`) uy quyen thang cho `MediaStore` da co, va bon nha cung cap
 * (none/local/s3/gcs) van duoc chon o dung mot cho — `createMediaStore()`.
 *
 * Vay vi sao van can mot cong RIENG? Vi `MediaStore` tra loi duoc bon cau hoi, con nen tang tep can
 * nam:
 *
 *   · `MediaStore` khong co `stat()` — nen phep do mo coi (`#287` P8) khong co CAU de hoi. Cong nay
 *     dat cau do. Hien thuc hom nay tra loi bang mot lan `get()` (xem `MediaFileBlobStore.stat`),
 *     tuc van tai byte ve; mot phep HEAD that su la viec cua tang nha cung cap, va tang do thuoc
 *     `#227`. Phan chot o day la NGU NGHIA — `PRESENT`/`MISSING`/`UNSUPPORTED` — chu khong phai
 *     mot toi uu duong truyen;
 *   · `MediaStore` khong khai bao MINH LA AI (`provider`), ma `#287` P1 doi luu nha cung cap vao
 *     tung hang de mot ban da doi kho van doc lai duoc tep cu.
 *
 * ============================================================================================
 * KHONG MOT NGU NGHIA NAO CUA MOT NHA CUNG CAP CU THE DI QUA DAY
 * ============================================================================================
 *
 * `#287` P4: *"Provider-neutral business code must not contain GCS-only semantics."* Nen o day
 * khong co `bucket`, khong co `generation`, khong co URL ky san, khong co lop luu tru. Chi co mot
 * chuoi khoa duc va nam phep.
 */

/** Byte doc ra tu kho. */
export interface FileBlob {
  readonly body: Buffer;
  readonly contentType: string;
}

/**
 * KET QUA `stat()` — mot UNION CO NHAN, khong mot `null`.
 *
 * Ba nhanh vi phep do mo coi (`#287` P8) phai phan biet duoc chung, va gop lai la lam chinh phep do
 * do noi doi:
 *
 *   · `PRESENT`     — byte con do;
 *   · `MISSING`     — kho tra loi duoc, va cau tra loi la KHONG CO. Mot hang metadata tro vao day
 *     la mot ban ghi mo coi that;
 *   · `UNSUPPORTED` — kho KHONG TRA LOI DUOC (vd `MEDIA_STORE=none`). Dem no thanh "mat byte" se
 *     bao ca kho la mo coi moi lan chay CI.
 */
export type FileBlobStat =
  | { readonly kind: 'PRESENT'; readonly byteSize: number }
  | { readonly kind: 'MISSING' }
  | { readonly kind: 'UNSUPPORTED' };

export interface FileBlobStoreHealth {
  readonly healthy: boolean;
  /** Mo ta ngan cho nguoi van hanh. KHONG duoc chua khoa/secret hay URL co chu ky — `#287` P7. */
  readonly detail: string;
}

export abstract class FileBlobStore {
  /** Nha cung cap dang dung — ghi vao tung hang tep, xem `FileRecord.storageProvider`. */
  abstract readonly provider: FileStorageProvider;
  /** `false` = khong luu gi ca (`MEDIA_STORE=none`, mac dinh demo/CI). */
  abstract readonly enabled: boolean;
  /** Kho co don duoc byte khong — mot co DOC DUOC, khong phai mot phep thu. */
  abstract readonly supportsRemove: boolean;

  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract read(key: string): Promise<FileBlob | null>;
  abstract stat(key: string): Promise<FileBlobStat>;

  /**
   * DON BYTE — IDEMPOTENT. Khoa khong ton tai KHONG phai loi.
   *
   * `#287` P3 bat bien 3/4: don byte la mot buoc RIENG va lam lai duoc, va mot byte da bien mat
   * khong duoc lam trang thai logic song lai. Tra ve `false` khi kho khong don duoc (thay vi nem)
   * de mot lan don khong thanh cong van ghi lai duoc mot ma loi doc duoc — xem `FilePurgeService`.
   */
  abstract remove(key: string): Promise<boolean>;

  abstract check(): Promise<FileBlobStoreHealth>;
}
