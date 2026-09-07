import { z } from 'zod';
import { FUEL_DOCUMENT_KINDS, FUEL_DOCUMENT_STATUSES } from './fuel-document.types.js';
import { MAX_INVOICE_BYTES } from './fuel-invoice-source.js';

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

export const ingestFuelDocumentSchema = z
  .object({
    /** Ten tep / ma thu — de nguoi doi soat tim lai ban goc. */
    sourceRef: z.string().trim().min(1).max(255),
    kind: z.enum(FUEL_DOCUMENT_KINDS),
    contentBase64: z.string().min(1).max(BASE64_MAX_LENGTH),
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
