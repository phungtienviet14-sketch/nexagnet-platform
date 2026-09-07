import { z } from 'zod';
import { FUEL_DOCUMENT_STATUSES } from './fuel-document.types.js';
import { MAX_INVOICE_BYTES } from './fuel-invoice-source.js';
import { FUEL_RECEIPT_MEDIA_TYPES, MAX_RECEIPT_BYTES } from './fuel-receipt-image.js';

/**
 * KIEM DAU VAO cua duong nhap chung tu nhien lieu (Lane C / C2).
 *
 * `contentBase64` theo dung khuon ma `importStatementSchema` da dat cho bang ke: mot chuoi base64
 * trong than JSON. KHONG dung `multipart/form-data` — duong nay duoc goi boi mot tien trinh (hop
 * thu hoa don, mot lan nhap tay tu man hinh van hanh), khong boi mot bieu mau tai tep, va mot than
 * JSON de ky / ghi nhat ky / gui lai hon mot luong multipart.
 */

/**
 * Bien do dai chuoi base64, suy TU bien byte cua `XmlFuelInvoiceSource`.
 *
 * Base64 no ra 4/3, cong dem phan chen dong. Tinh TU hang so kia chu khong go mot con so thu hai:
 * hai bien roi nhau se troi khoi nhau, va khi do mot tep lot qua zod roi bi tang duoi tu choi voi
 * mot ma khac han — nguoi dung thay hai thong diep cho cung mot van de.
 */
const BASE64_MAX_LENGTH = Math.ceil((MAX_INVOICE_BYTES * 4) / 3) + 1_024;

/**
 * DUONG NAY CHI NHAN CHUNG TU CO CAU TRUC — KHONG phai ca `FUEL_DOCUMENT_KINDS`.
 *
 * Khi C3 them `RECEIPT_IMAGE` vao enum kia, viet `z.enum(FUEL_DOCUMENT_KINDS)` o day se lang le mo
 * duong nay ra cho anh — va byte anh se di thang vao mot bo doc XML. Danh sach RIENG o day la thu
 * lam cho viec them mot loai chung tu moi KHONG tu dong noi rong mot cua da co.
 */
const STRUCTURED_DOCUMENT_KINDS = ['EINVOICE_XML'] as const;

export const ingestFuelDocumentSchema = z
  .object({
    /** Ten tep / ma thu — de nguoi doi soat tim lai ban goc. */
    sourceRef: z.string().trim().min(1).max(255),
    kind: z.enum(STRUCTURED_DOCUMENT_KINDS),
    contentBase64: z.string().min(1).max(BASE64_MAX_LENGTH),
  })
  .strict();

/**
 * NHAP MOT BUC ANH (C3) — mot khuon rieng, mot tran rieng.
 *
 * `mediaType` o day chi la LOI KHAI. No van bi doi chieu voi byte dau tep o
 * `guardReceiptImage()`, va mot loi khai lech bi tu choi. Zod chan duoc mot chuoi rac; no khong
 * chan duoc mot tep HTML mang duoi `image/jpeg`.
 */
const RECEIPT_BASE64_MAX_LENGTH = Math.ceil((MAX_RECEIPT_BYTES * 4) / 3) + 1_024;

export const ingestFuelReceiptImageSchema = z
  .object({
    sourceRef: z.string().trim().min(1).max(255),
    mediaType: z.enum(FUEL_RECEIPT_MEDIA_TYPES),
    contentBase64: z.string().min(1).max(RECEIPT_BASE64_MAX_LENGTH),
  })
  .strict();

/**
 * BO LOC danh sach chung tu — `catch()` tung truong, KHONG `BadRequestException`.
 *
 * Cung nguyen tac voi `fuelEntryInboxQuerySchema`: mot deep link cu hoac bi cat hong mo ra man hinh
 * mac dinh thay vi mot trang loi (#222 P2).
 */
const boundedNumber = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).catch(fallback);

export const FUEL_DOCUMENT_DEFAULT_LIMIT = 50;
export const FUEL_DOCUMENT_MAX_LIMIT = 200;

export const listFuelDocumentsQuerySchema = z.object({
  supplierId: z.string().trim().min(1).max(100).nullish().catch(null),
  status: z.enum(FUEL_DOCUMENT_STATUSES).nullish().catch(null),
  limit: boundedNumber(FUEL_DOCUMENT_DEFAULT_LIMIT, 1, FUEL_DOCUMENT_MAX_LIMIT),
  offset: boundedNumber(0, 0, 1_000_000),
});

export type IngestFuelDocumentBody = z.infer<typeof ingestFuelDocumentSchema>;
export type IngestFuelReceiptImageBody = z.infer<typeof ingestFuelReceiptImageSchema>;
