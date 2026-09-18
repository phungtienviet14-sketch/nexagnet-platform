import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.types.js';

/**
 * Hinh dang mot tep multer gui vao, KHAI TAI CHO thay vi keo `@types/multer`.
 *
 * Cung ly le va cung hinh dang voi `UploadedEvidenceFile` cua van tai: `multer` da co san (phu
 * thuoc bac hai cua `@nestjs/platform-express`) nhung goi kieu cua no thi khong, va them mot
 * devDependency chi de go bon truong la mot thay doi lockfile khong can thiet.
 *
 * KHONG dung chung kieu do bang mot lan `import`: nen tang tep thuoc `foundation`, va mot module
 * moi khach deu nap khong duoc phu thuoc vao mot mien ma phan lon khach khong bat.
 */
export interface UploadedPlatformFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
  readonly originalname: string;
}

/**
 * DANH TINH tu PHIEN, khong tu than yeu cau.
 *
 * `#287` P6: *"caller cannot forge creator/withdrawer/time/tenant scope"*. Mot tuyen doc `createdBy`
 * tu lieu do la mot tuyen cho nguoi goi tu khai minh la ai — nen khong tuyen nao o `FilesController`
 * lam vay, va tat ca deu di qua ham nay.
 */
export function requireFileAuthUserId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Nen tang tep doi mot phien dang nhap');
  return id;
}
