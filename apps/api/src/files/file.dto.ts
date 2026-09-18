import type { FileLink, FileRecord, FileScanState, FileState } from './file.types.js';

/**
 * BAN CONG KHAI cua mot tep — `#287` P1.
 *
 * ============================================================================================
 * DANH SACH NAY LA MOT DANH SACH TRANG
 * ============================================================================================
 *
 * `#287` P1: *"No public DTO may expose provider key, bucket name, filesystem path or permanent
 * provider URL."*
 *
 * Cach giu dieu do KHONG phai mot lan xoa truong o cho tra ve — cach do hong ngay lan dau ai do
 * them mot cot moi vao `FileRecord`. Cach giu la mot kieu RIENG, liet ke tung truong, va mot bai
 * test doc chinh ma nguon (`file-public-surface.spec.ts`) de chan dung ngay mot truong ten
 * `storageKey`/`locator`/`bucket`/`url` xuat hien o day.
 *
 * ============================================================================================
 * `storageProvider` CUNG KHONG CO MAT, va do khong phai cho cau ne
 * ============================================================================================
 *
 * Ten nha cung cap khong phai mot dinh vi. Nhung no la thong tin dau tien mot nguoi muon lay du
 * lieu ra khoi he thong nay can — no thu hep khong gian tan cong tu "mot kho object nao do" xuong
 * "mot kho cu the, voi dung mot bo API". Nguoi dung khong can biet, nen no o lai ben trong.
 *
 * Nguoi VAN HANH thi can, va ho doc no qua duong dau vet/telemetry — noi da co quyen rieng.
 */
export interface FileDescriptor {
  readonly id: string;
  readonly purpose: string;
  /** Ten DA CHUAN HOA. Ten goc cua nguoi dung khong ra khoi may chu — xem `safeFilename()`. */
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly state: FileState;
  readonly scanState: FileScanState;
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly withdrawnAt: string | null;
}

/**
 * BAN CONG KHAI cua mot lien ket.
 *
 * `businessOwnerType`/`businessOwnerId` CO mat: do la thong tin cua chinh nguoi goi — ho vua gan
 * tep vao doi tuong do, hoac ho dang nhin mot tep ma ho da co quyen doc. Giau di se lam giao dien
 * khong noi duoc "to nay dang thuoc ho so nao".
 */
export interface FileLinkDescriptor {
  readonly id: string;
  readonly fileId: string;
  readonly businessOwnerType: string;
  readonly businessOwnerId: string;
  readonly purpose: string;
  readonly state: FileLink['state'];
  readonly createdAt: string;
  readonly withdrawnAt: string | null;
}

/**
 * MOT cho duy nhat cat `storageKey` di.
 *
 * Moi controller tu nho "dung tra truong do" la mot chien luoc that bai o lan them tuyen thu ba.
 * Ham nay la cho DUY NHAT bien mot `FileRecord` thanh thu di ra day, va no LIET KE tung truong —
 * khong `...file`, khong `omit`, khong `delete`.
 */
export function toFileDescriptor(file: FileRecord): FileDescriptor {
  return {
    id: file.id,
    purpose: file.purpose,
    filename: file.safeFilename,
    contentType: file.declaredMimeType,
    byteSize: file.byteSize,
    sha256: file.sha256,
    state: file.state,
    scanState: file.scanState,
    createdAt: file.createdAt.toISOString(),
    activatedAt: file.activatedAt?.toISOString() ?? null,
    withdrawnAt: file.withdrawnAt?.toISOString() ?? null,
  };
}

export function toFileLinkDescriptor(link: FileLink): FileLinkDescriptor {
  return {
    id: link.id,
    fileId: link.fileId,
    businessOwnerType: link.businessOwnerType,
    businessOwnerId: link.businessOwnerId,
    purpose: link.purpose,
    state: link.state,
    createdAt: link.createdAt.toISOString(),
    withdrawnAt: link.withdrawnAt?.toISOString() ?? null,
  };
}
