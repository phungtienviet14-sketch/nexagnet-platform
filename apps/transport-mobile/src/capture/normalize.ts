/**
 * CHUAN HOA TEP CHUNG TU truoc khi xep hang — thuan, test tren Node.
 *
 * May chu nhan DUNG bon loai: JPEG/PNG/WebP/PDF, toi da 15 MB, va SO NOI DUNG voi loai khai bao
 * (`file-policy.ts`). iPhone chup HEIC — khong nam trong danh sach nao. Nen MOI anh deu duoc ve
 * lai thanh JPEG, canh dai toi da 2000 px, chat luong 0,8: mot to phieu 12 MP con ~400-800 KB, van
 * doc ro so lit/so tien, va mot ngay 30 lan giao khong lam day bo nho may.
 */
export const MAX_IMAGE_EDGE_PX = 2000;
export const JPEG_QUALITY = 0.8;
export const MAX_UPLOAD_BYTES = 15_000_000;
export const PDF_CONTENT_TYPE = 'application/pdf';
export const JPEG_CONTENT_TYPE = 'image/jpeg';

/**
 * Kich thuoc dich: GIU ti le, chi THU NHO (khong phong to anh nho). `null` = khong can doi kich
 * thuoc. Kich thuoc khong biet (0, NaN — thu vien anh co khi khong bao) -> `null`, de lop goi doc
 * kich thuoc that roi hoi lai.
 */
export function resizeTarget(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE_PX,
): { readonly width: number } | { readonly height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/** Kich thuoc co biet khong — biet thi quyet ngay, khong thi phai doc anh truoc. */
export function hasKnownSize(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

/** Tep chon tu "Chọn tệp PDF" co that la PDF khong — theo loai khai bao HOAC duoi ten. */
export function isPdf(
  mimeType: string | null | undefined,
  name: string | null | undefined,
): boolean {
  if (mimeType && mimeType.toLowerCase() === PDF_CONTENT_TYPE) return true;
  return typeof name === 'string' && /\.pdf$/i.test(name.trim());
}

/** `null` = co the gui; chuoi = ly do tu choi TRUOC khi xep hang (khoi doi may chu noi 400). */
export function fileSizeProblem(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return null;
  if (bytes <= 0) return 'Tệp rỗng — chọn lại tệp khác.';
  if (bytes > MAX_UPLOAD_BYTES) return 'Tệp quá lớn (tối đa 15 MB) — chọn tệp nhỏ hơn.';
  return null;
}

/**
 * Nguon anh -> `captureMode` gui may chu. NOI THAT: chup trong ung dung = `LIVE_CAMERA`; chon tu
 * thu vien = `GALLERY` (may chu gan co `PHOTO_FROM_GALLERY`); tep/khong biet = `UNKNOWN`.
 */
export type CaptureSource = 'IN_APP_CAMERA' | 'LIBRARY' | 'FILE' | 'BROWSER_CAPTURE';

export function captureModeOf(source: CaptureSource): 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN' {
  switch (source) {
    case 'IN_APP_CAMERA':
      return 'LIVE_CAMERA';
    case 'LIBRARY':
      return 'GALLERY';
    case 'FILE':
    case 'BROWSER_CAPTURE':
      // Trinh duyet: `<input capture>` tren may tinh mo hop chon tep — khong chung minh duoc anh
      // vua chup, nen khong duoc goi la LIVE_CAMERA.
      return 'UNKNOWN';
  }
}
