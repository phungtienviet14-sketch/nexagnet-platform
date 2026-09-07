import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { FuelDocumentKind, FuelDocumentRejectReason } from './fuel-document.types.js';
import {
  parseEInvoiceXml,
  type EInvoiceRejectReason,
  type ParsedInvoice,
} from './fuel-einvoice-parse.js';

/**
 * `FuelInvoiceSource` — CUA VAO DUY NHAT cua mot chung tu nhien lieu co cau truc.
 *
 * ===========================================================================
 * VI SAO LA MOT CONG chu khong phai mot ham
 *
 * Cung ly le voi `FuelStatementSource` cua `GD-07`, va o day con manh hon: `Q-08` (R0 §7) CHUA CO
 * LOI — chua ai biet B nhan hoa don dien tu qua duong nao (thu dien tu tu cay xang, mot cong API
 * cua don vi cung cap dich vu hoa don, hay mot ban ket xuat cuoi ky). Ba duong do khac nhau o CHO
 * LAY BYTE, khong khac nhau o cho HIEU BYTE.
 *
 * Nen cong nay nhan BYTE va tra ve mot hoa don da doc. Khi duong lay byte thu hai xuat hien, thu
 * phai them la mot adapter sau cong nay; khong mot dong nao cua `fuel-document.service.ts` phai
 * doi. Neu goi thang `parseEInvoiceXml` trong service, adapter thu hai se phai chen vao giua mot
 * ham dang doc chuoi — va luc do chi phi dao nguoc khong con thap nua.
 *
 * ===========================================================================
 * CONG NAY KHONG BIET GI VE NGHIEP VU
 *
 * No khong tra ve `supplierId`, khong nhan ra cay xang, khong doi don vi. No tra ve nhung gi CHUNG
 * TU NOI. Viec noi chung tu do voi danh muc cua khach la cua `fuel-document.service.ts`, va do la
 * mot tang co kho, co quyen, co dau vet.
 */

export interface FuelInvoiceFile {
  /** Ten tep / ma thu — de nguoi doi soat tim lai ban goc. */
  readonly sourceRef: string;
  readonly kind: FuelDocumentKind;
  readonly content: Buffer;
}

export type FuelInvoiceReadResult =
  | { readonly ok: true; readonly invoice: ParsedInvoice }
  | { readonly ok: false; readonly reason: FuelDocumentRejectReason };

export abstract class FuelInvoiceSource {
  abstract read(file: FuelInvoiceFile): FuelInvoiceReadResult;
}

/**
 * Mot hoa don dien tu la mot tep XML nho — vai chuc kilobyte.
 *
 * Bien nay chan mot tep NHAM (ai do keo mot ban ket xuat ca nam vao o nhap mot hoa don), khong
 * phai mot gioi han nghiep vu. No duoc kiem TRUOC khi doc, nen mot tep 200 MB khong bao gio duoc
 * dua vao bo phan tich.
 */
export const MAX_INVOICE_BYTES = 2_000_000;

/**
 * NAM ma tu choi cua tang doc XML -> nam ma tu choi cua tang chung tu.
 *
 * MOT cho anh xa duy nhat. Hai bo ma ton tai rieng vi chung thuoc hai tang: bo kia la tu vung cua
 * MOT BO DOC XML, bo nay la tu vung cua MOT LAN NHAP. Chung tinh co trung ten hom nay, va anh xa
 * tuong minh o day la thu giu cho lan chung khong con trung nua khong lam ai bat ngo.
 */
const DOCUMENT_REASON_BY_PARSE_REASON = {
  MALFORMED_XML: 'MALFORMED_XML',
  EXTERNAL_ENTITY_REJECTED: 'EXTERNAL_ENTITY_REJECTED',
  NOT_AN_INVOICE: 'NOT_AN_INVOICE',
  MISSING_INVOICE_IDENTITY: 'MISSING_INVOICE_IDENTITY',
  NO_LINE_ITEMS: 'NO_LINE_ITEMS',
} as const satisfies Record<EInvoiceRejectReason, FuelDocumentRejectReason>;

/** SHA-256 cua BYTE GOC — khoa chong nhap trung lop mot (`INV-C2-DUP`). */
export const invoiceDigest = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex');

/**
 * Hien thuc DUY NHAT hom nay: doc mot tep XML da nam trong bo nho.
 *
 * `utf8` co dinh: chuan hoa don dien tu khai `encoding="UTF-8"`, va doan bang cach do byte se lam
 * mot hoa don co dau tieng Viet doc ra sai o dung nhung ten cay xang ma ta can de nhan dang.
 */
@Injectable()
export class XmlFuelInvoiceSource extends FuelInvoiceSource {
  read(file: FuelInvoiceFile): FuelInvoiceReadResult {
    if (file.content.byteLength === 0) return { ok: false, reason: 'EMPTY' };
    if (file.content.byteLength > MAX_INVOICE_BYTES) return { ok: false, reason: 'TOO_LARGE' };

    const parsed = parseEInvoiceXml(file.content.toString('utf8'));
    return parsed.ok
      ? { ok: true, invoice: parsed.invoice }
      : { ok: false, reason: DOCUMENT_REASON_BY_PARSE_REASON[parsed.reason] };
  }
}
