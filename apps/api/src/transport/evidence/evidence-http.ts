import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { EvidenceReadResult } from './transport-evidence.service.js';

/**
 * Phan HTTP dung chung cua hai be mat bang chung (lai xe + van hanh) — `#169`.
 *
 * Tach ra de hai controller khong cheo nhau: mot controller `import` controller kia chi de dung mot
 * ham nho la cach hai be mat le ra phai tach bat dau dinh lai voi nhau.
 */

/**
 * Hinh dang mot tep multer gui vao, KHAI TAI CHO thay vi keo `@types/multer`.
 *
 * `multer@2.2.0` da co san (phu thuoc bac hai cua `@nestjs/platform-express`), nhung goi kieu cua
 * no thi khong — va them mot devDependency chi de go bon truong la mot thay doi lockfile khong can
 * thiet cho mot bien gioi ma chung ta chi doc dung bon truong do.
 */
export interface UploadedEvidenceFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
  readonly originalname: string;
}

/**
 * Lay byte + content-type tu tep gui len.
 *
 * `originalname` CO Y KHONG duoc doc: ten tep la du lieu ben ngoai, va duoi tep cua khoa object
 * duoc suy tu content-type da qua danh sach trang (`buildEvidenceKey`). Doc ten tep o day se mo lai
 * dung duong ma viec suy tu content-type sinh ra de dong.
 */
export function uploadedBytes(file: UploadedEvidenceFile | undefined): {
  bytes: Buffer;
  contentType: string;
} {
  if (!file) {
    throw new BadRequestException('Thieu tep: gui multipart voi truong "file"');
  }
  return { bytes: file.buffer, contentType: file.mimetype };
}

/**
 * Tra byte ra day, hoac 404 khi kho khong con tep — acceptance 9 cua #169.
 *
 * `MISSING` la mot trang thai NGHIEP VU: co dong bang chung trong Postgres nhung khong con object.
 * No thanh 404 kem mot cau doc duoc, KHONG phai mot ngoai le cua SDK luu tru do ra ngoai.
 */
export function sendEvidence(response: Response, result: EvidenceReadResult): void {
  if (result.kind === 'MISSING') {
    throw new NotFoundException('Khong con tep bang chung trong kho anh');
  }
  response.setHeader('Content-Type', result.object.contentType);
  // Khong de trinh duyet doan lai kieu tep: mot tep duoc doan thanh HTML la mot duong XSS.
  response.setHeader('X-Content-Type-Options', 'nosniff');
  // Bang chung khong duoc chay nhu mot trang: `sandbox` chan script/form ngay ca khi mot loai tep
  // moi lot qua danh sach trang sau nay.
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // Bang chung la PII: khong cache o proxy chung, khong luu ra dia cua trinh duyet.
  response.setHeader('Cache-Control', 'private, no-store');
  response.end(result.object.body);
}
