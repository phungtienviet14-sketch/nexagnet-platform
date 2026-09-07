import type { ReceiptRejectReason } from './fuel-receipt-extraction.js';

/**
 * BUC ANH PHIEU DO DAU — kiem o RANH GIOI, truoc khi mot byte nao roi khoi tien trinh (C3).
 *
 * ===========================================================================
 * BYTE NOI THAT, TEN TEP THI KHONG
 *
 * Nguoi goi khai `mediaType`. Cong khong tin loi khai do: no doc VAI BYTE DAU va so voi chu ky
 * that cua dinh dang. Hai kieu hong bi chan o day, va chung khac nhau:
 *
 *   1. Mot tep KHONG PHAI ANH mang duoi `.jpg`. Neu di tiep, ta gui noi dung tuy y — co the la mot
 *      tep cau hinh, mot ban ket xuat — sang mot dich vu O NGOAI. Do la mot duong ro du lieu, khong
 *      phai mot loi dinh dang.
 *   2. Mot anh THAT nhung dinh dang mo hinh khong doc duoc (HEIC tu iPhone la ca mot ho). Tu choi
 *      CO TEN o day de nguoi truc biet phai bao lai xe doi cai dat may anh, chu khong di tim mot
 *      loi mang khong ton tai.
 *
 * ===========================================================================
 * TRAN KICH THUOC KHAC HAN DUONG XML
 *
 * `MAX_INVOICE_BYTES` la 2 MB vi mot hoa don XML la vai chuc kilobyte. Mot buc anh chup bang dien
 * thoai doi 2026 thuong 2..6 MB TRUOC khi nen. Dung lai tran cua XML se tu choi phan lon anh that
 * — mot phep kiem dung ve nguyen tac nhung sai ve so, tuc la mot phep kiem hong.
 */

/**
 * BA dinh dang. Danh sach nay la giao cua "may anh dien thoai xuat ra" va "moi mo hinh doc anh
 * deu nhan" — them mot dinh dang thu tu vao day phai la mot quyet dinh co do, khong phai mot dong
 * them cho du.
 */
export const FUEL_RECEIPT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FuelReceiptMediaType = (typeof FUEL_RECEIPT_MEDIA_TYPES)[number];

/** 8 MB — mot buc anh dien thoai chua nen, khong phai mot gioi han nghiep vu. */
export const MAX_RECEIPT_BYTES = 8_000_000;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

const startsWith = (content: Buffer, magic: readonly number[], offset = 0): boolean =>
  content.byteLength >= offset + magic.length &&
  magic.every((byte, index) => content[offset + index] === byte);

/**
 * DINH DANG THAT cua mot buffer, doc tu byte dau — hoac `null` neu khong nhan ra.
 *
 * WebP doi HAI phep so: mot vo `RIFF` chung (WAV cung dung vo do) VA nhan `WEBP` o byte thu 8. Chi
 * kiem `RIFF` se cho mot tep am thanh di qua duoi ten mot buc anh.
 */
export function sniffReceiptMediaType(content: Buffer): FuelReceiptMediaType | null {
  if (startsWith(content, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(content, PNG_MAGIC)) return 'image/png';
  if (startsWith(content, RIFF_MAGIC) && startsWith(content, WEBP_TAG, 8)) return 'image/webp';
  return null;
}

export type ReceiptImageGuard =
  | { readonly ok: true; readonly mediaType: FuelReceiptMediaType }
  | { readonly ok: false; readonly reason: ReceiptRejectReason };

/**
 * BON phep kiem, theo thu tu re dan ve dat — kich thuoc truoc, byte sau.
 *
 * Loi khai cua nguoi goi duoc doi chieu voi byte va PHAI khop. Mot tep PNG khai la `image/jpeg` bi
 * tu choi thay vi duoc "sua giup": mot lech nhu vay nghia la mot khau nao do o phia goi dang hong,
 * va sua giup o day se giau cai hong do di cho den khi no lo ra o mot cho dat hon.
 */
export function guardReceiptImage(image: {
  readonly mediaType: string;
  readonly content: Buffer;
}): ReceiptImageGuard {
  if (image.content.byteLength === 0) return { ok: false, reason: 'EMPTY' };
  if (image.content.byteLength > MAX_RECEIPT_BYTES) return { ok: false, reason: 'TOO_LARGE' };

  const sniffed = sniffReceiptMediaType(image.content);
  if (sniffed === null) return { ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' };
  if (sniffed !== image.mediaType) return { ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' };
  return { ok: true, mediaType: sniffed };
}
