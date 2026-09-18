import { z } from 'zod';
import { FILE_PURPOSES } from './file.types.js';

/**
 * KIEM DAU VAO tai BIEN GIOI HTTP cua nen tang tep.
 *
 * Dat trong thu muc cua chinh module (nhu `auth/auth.schemas.ts` va `transport/transport.schemas.ts`
 * da lam) chu khong o `packages/shared`: khong client nao dung chung nhung kieu nay hom nay, va dua
 * chung len goi dung chung se buoc moi khach phai build lai khi mot truong cua nen tang tep doi.
 */

const nonEmpty = z.string().trim().min(1);

/** Ten so huu va muc dich cua mien — GIOI HAN DO DAI khop `VARCHAR` cua cot. */
const ownerType = nonEmpty.max(60);
const linkPurpose = nonEmpty.max(60);

export const uploadFileSchema = z.object({
  purpose: z.enum(FILE_PURPOSES),
});

/**
 * `fileId` KHONG nam trong than yeu cau — no o duong dan.
 *
 * Mot lieu do vua co `fileId` vua nam duoi mot duong dan co `:fileId` la hai nguon cho cung mot su
 * that, va se co luc chung lech nhau. Cung quy uoc voi `runId` cua `DocumentsController`.
 */
export const linkFileSchema = z.object({
  businessOwnerType: ownerType,
  businessOwnerId: nonEmpty.max(200),
  purpose: linkPurpose,
});

export const withdrawFileSchema = z.object({
  reason: nonEmpty.max(500),
});

/** `#287` P8 — dat/go lenh giu theo phap ly. `hold` la BAT BUOC: khong mac dinh thanh `true`. */
export const legalHoldSchema = z.object({
  hold: z.boolean(),
});

/**
 * Cau dau tien zod phan nan, kem duong dan truong.
 *
 * Tra MOT cau chu khong ca mang: mot giao dien hien duoc mot loi mot luc, va mot mang loi day du
 * de lo hinh dang noi bo cua lieu do cho nguoi goi chua qua duoc cong kiem.
 */
export function firstFileIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Du lieu khong hop le';
  const path = issue.path.join('.');
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}
