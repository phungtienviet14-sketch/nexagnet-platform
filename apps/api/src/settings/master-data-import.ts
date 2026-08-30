import { BadRequestException } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import readXlsxFile from 'read-excel-file/node';
import { z } from 'zod';

const MAX_IMPORT_BYTES = 5_000_000;
const textSchema = z.string().trim().min(1).max(300);
const idSchema = z.string().trim().min(1).max(128);
const nullableTextSchema = z.string().trim().min(1).max(300).nullable().default(null);
const instantSchema = z.string().datetime({ offset: true }).nullable().default(null);
const metadataSchema = z
  .record(z.string().trim().min(1).max(100), z.unknown())
  .nullable()
  .default(null)
  .refine((value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') <= 10_000, {
    message: 'metadata vượt quá 10 KB',
  });

export const importedDealerSchema = z
  .object({
    id: idSchema.optional(),
    code: nullableTextSchema,
    name: textSchema,
    aliases: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
    tier: z.enum(['dai_ly', 'ctv']),
    defaultPolicy: z.enum([
      'cong_no_30',
      'cong_no_45',
      'ky_gui',
      'thanh_toan_ngay',
      'cod',
    ]),
    phone: z.string().trim().min(1).max(30).nullable().default(null),
    status: z.enum(['active', 'inactive']).default('active'),
    metadata: metadataSchema,
  })
  .strict();

export const importedDealSchema = z
  .object({
    id: idSchema.optional(),
    dealerId: idSchema,
    sku: idSchema,
    price: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    /**
     * ASM-03 (Issue #77): deal ap tu SL 1 cho toi khi khach noi khac.
     *
     * `.default(1)` chu khong phai `.nullish()`: import de trong phai GHI SO 1 vao Postgres, khong
     * duoc de NULL. NULL la mot gia dinh khong ai ky ten — doc lai sau ba thang thi khong phan
     * biet duoc "khach chua noi nen ta gia dinh 1" voi "khach da chot la khong co nguong".
     */
    minQuantity: z.coerce.number().int().positive().default(1),
    enabled: z.boolean().default(true),
    effectiveFrom: instantSchema,
    effectiveTo: instantSchema,
  })
  .strict();

export const importedGroupSchema = z
  .object({
    chatId: idSchema.nullable().default(null),
    name: textSchema,
    dealerId: idSchema.nullable().default(null),
    dealerReference: textSchema.optional(),
    branch: z.string().trim().min(1).max(100).nullable().default(null),
    enabled: z.boolean().default(true),
  })
  .strict();

export type ImportedDealer = z.infer<typeof importedDealerSchema>;
export type ImportedDeal = z.infer<typeof importedDealSchema>;
export type ImportedGroup = z.infer<typeof importedGroupSchema>;
export type MasterDataImportFormat = 'xlsx' | 'csv' | 'json';
export type MasterDataImportResource = 'dealer' | 'deal' | 'group';

export type ParsedMasterDataRow =
  | { resource: 'dealer'; rowNumber: number; sheet?: string; value: ImportedDealer }
  | { resource: 'deal'; rowNumber: number; sheet?: string; value: ImportedDeal }
  | { resource: 'group'; rowNumber: number; sheet?: string; value: ImportedGroup };

export interface MasterDataImportRowError {
  resource?: MasterDataImportResource;
  rowNumber: number;
  sheet?: string;
  message: string;
}

export interface ParsedMasterDataImport {
  format: MasterDataImportFormat;
  rows: ParsedMasterDataRow[];
  errors: MasterDataImportRowError[];
}

export interface MasterDataImportInput {
  format: MasterDataImportFormat;
  encoding: 'base64' | 'utf8';
  content: string;
  filename?: string;
}

const inputSchema = z
  .object({
    format: z.enum(['xlsx', 'csv', 'json']),
    encoding: z.enum(['base64', 'utf8']),
    content: z.string().min(1),
    filename: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const TIER_LABELS: Readonly<Record<string, ImportedDealer['tier']>> = {
  'Đại lý': 'dai_ly',
  'CTV (Cộng tác viên)': 'ctv',
  dai_ly: 'dai_ly',
  ctv: 'ctv',
};

const POLICY_LABELS: Readonly<Record<string, ImportedDealer['defaultPolicy']>> = {
  'Công nợ 30 ngày': 'cong_no_30',
  'Công nợ 45 ngày': 'cong_no_45',
  'Ký gửi': 'ky_gui',
  'Thanh toán ngay': 'thanh_toan_ngay',
  'COD (thu hộ khi giao)': 'cod',
  cong_no_30: 'cong_no_30',
  cong_no_45: 'cong_no_45',
  ky_gui: 'ky_gui',
  thanh_toan_ngay: 'thanh_toan_ngay',
  cod: 'cod',
};

const DEALER_SHEET = '1. Đại lý & CTV';
const GROUP_SHEET = '2. Map nhóm Zalo';
const DEAL_SHEET_NAMES = ['3. Deal riêng', '3. Deal rieng', 'Deal riêng'] as const;

export async function parseMasterDataImport(input: unknown): Promise<ParsedMasterDataImport> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('Payload import master data không hợp lệ');
  const bytes = decodeContent(parsed.data);
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new BadRequestException('File import vượt quá giới hạn 5 MB');
  }
  if (parsed.data.format === 'xlsx') return parseWorkbook(bytes);
  const text = bytes.toString('utf8');
  return parsed.data.format === 'csv' ? parseCsvImport(text) : parseJsonImport(text);
}

function decodeContent(input: z.infer<typeof inputSchema>): Buffer {
  if (input.encoding === 'utf8') return Buffer.from(input.content, 'utf8');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content) || input.content.length % 4 !== 0) {
    throw new BadRequestException('Nội dung base64 không hợp lệ');
  }
  return Buffer.from(input.content, 'base64');
}

function parseJsonImport(content: string): ParsedMasterDataImport {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    throw new BadRequestException('Nội dung JSON không hợp lệ');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BadRequestException('JSON phải là object gồm dealers, deals và groups');
  }
  const record = raw as Record<string, unknown>;
  const rows: ParsedMasterDataRow[] = [];
  const errors: MasterDataImportRowError[] = [];
  collectRows('dealer', Array.isArray(record.dealers) ? record.dealers : [], rows, errors);
  collectRows('deal', Array.isArray(record.deals) ? record.deals : [], rows, errors);
  collectRows('group', Array.isArray(record.groups) ? record.groups : [], rows, errors);
  return { format: 'json', rows, errors };
}

function parseCsvImport(content: string): ParsedMasterDataImport {
  let records: Record<string, string>[];
  try {
    records = parseCsv(content, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    throw new BadRequestException('Nội dung CSV không hợp lệ');
  }
  const rows: ParsedMasterDataRow[] = [];
  const errors: MasterDataImportRowError[] = [];
  records.forEach((record, index) => {
    const resource = parseResource(record.resource ?? record.type ?? record['Loại dữ liệu']);
    const rowNumber = index + 2;
    if (!resource) {
      errors.push({ rowNumber, message: 'resource phải là dealer, deal hoặc group' });
      return;
    }
    collectOne(resource, csvRecord(resource, record), rowNumber, undefined, rows, errors);
  });
  return { format: 'csv', rows, errors };
}

async function parseWorkbook(buffer: Buffer): Promise<ParsedMasterDataImport> {
  let workbook: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    workbook = await readXlsxFile(buffer);
  } catch {
    throw new BadRequestException('File XLSX không đọc được');
  }
  const sheetNames = workbook.map((sheet) => sheet.sheet);
  const rows: ParsedMasterDataRow[] = [];
  const errors: MasterDataImportRowError[] = [];
  collectWorkbookSheet(workbook, DEALER_SHEET, 'dealer', rows, errors);
  collectWorkbookSheet(workbook, GROUP_SHEET, 'group', rows, errors);
  const dealSheet = DEAL_SHEET_NAMES.find((name) => sheetNames.includes(name));
  if (dealSheet) collectWorkbookSheet(workbook, dealSheet, 'deal', rows, errors);
  if (!sheetNames.includes(DEALER_SHEET) || !sheetNames.includes(GROUP_SHEET)) {
    throw new BadRequestException(
      `File XLSX phải có sheet "${DEALER_SHEET}" và "${GROUP_SHEET}"`,
    );
  }
  return { format: 'xlsx', rows, errors };
}

function collectWorkbookSheet(
  workbook: Awaited<ReturnType<typeof readXlsxFile>>,
  sheet: string,
  resource: MasterDataImportResource,
  rows: ParsedMasterDataRow[],
  errors: MasterDataImportRowError[],
): void {
  const table = workbook.find((candidate) => candidate.sheet === sheet)?.data;
  if (!table) return;
  const [header = [], ...dataRows] = table;
  const headers = header.map(cellText);
  dataRows.forEach((row, index) => {
    if (row.every((cell) => cell === null || cellText(cell) === '')) return;
    if (resource === 'group' && cellText(row[0]).toLocaleLowerCase('vi').startsWith('ghi chú:')) {
      return;
    }
    const record: Record<string, unknown> = Object.fromEntries(
      headers.map((key, column) => [key, row[column] ?? null]),
    );
    const value = workbookRecord(resource, record);
    collectOne(resource, value, index + 2, sheet, rows, errors);
  });
}

function workbookRecord(
  resource: MasterDataImportResource,
  record: Readonly<Record<string, unknown>>,
): unknown {
  if (resource === 'dealer') {
    return {
      name: cellText(record['Tên đại lý / CTV (*)']),
      tier: TIER_LABELS[cellText(record['Cấp (*)'])] ?? cellText(record['Cấp (*)']),
      defaultPolicy:
        POLICY_LABELS[cellText(record['Chính sách mặc định (*)'])] ??
        cellText(record['Chính sách mặc định (*)']),
      phone: nullableCell(record['Số điện thoại']),
      aliases: splitAliases(cellText(record['Tên gọi tắt / viết tắt'])),
      code: nullableCell(record['Mã đại lý']),
      status: 'active',
      metadata: null,
    };
  }
  if (resource === 'group') {
    const dealerReference = cellText(record['Thuộc đại lý / CTV (*)']);
    return {
      name: cellText(record['Tên nhóm Zalo (*)']),
      dealerId: null,
      dealerReference,
      branch: nullableCell(record['Chi nhánh']),
      chatId: nullableCell(findHeaderValue(record, 'Chat ID nhóm')),
      enabled: true,
    };
  }
  // `Số lượng tối thiểu` TUNG BI BO QUA o day: schema co truong, nhung ca duong xlsx lan csv deu
  // khong doc no, nen Sale nhap "tu 5 cai" vao file roi import xong van ra deal ap tu 1 cai —
  // hong am tham, khong mot dong loi nao. Bo trong -> `.default(1)` cua schema (ASM-03).
  const minQuantity = nullableCell(record['Số lượng tối thiểu'] ?? record['SL tối thiểu']);
  return {
    dealerId: cellText(record['ID đại lý'] ?? record['Mã đại lý']),
    sku: cellText(record.SKU),
    price: cellNumber(record['Giá override'] ?? record['Đơn giá riêng']),
    ...(minQuantity === null ? {} : { minQuantity: cellNumber(minQuantity) }),
    effectiveFrom: nullableCell(record['Hiệu lực từ']),
    effectiveTo: nullableCell(record['Hiệu lực đến']),
    enabled: booleanCell(record['Bật'], true),
  };
}

function findHeaderValue(record: Readonly<Record<string, unknown>>, prefix: string): unknown {
  const entry = Object.entries(record).find(([header]) => header.startsWith(prefix));
  return entry?.[1];
}

function csvRecord(
  resource: MasterDataImportResource,
  record: Readonly<Record<string, string>>,
): unknown {
  if (resource === 'dealer') {
    return {
      ...(nullableCell(record.id) ? { id: nullableCell(record.id) } : {}),
      code: nullableCell(record.code),
      name: record.name,
      aliases: splitAliases(record.aliases ?? ''),
      tier: TIER_LABELS[record.tier ?? ''] ?? record.tier,
      defaultPolicy: POLICY_LABELS[record.defaultPolicy ?? ''] ?? record.defaultPolicy,
      phone: nullableCell(record.phone),
      status: record.status || 'active',
      metadata: parseMetadata(record.metadata),
    };
  }
  if (resource === 'deal') {
    return {
      ...(nullableCell(record.id) ? { id: nullableCell(record.id) } : {}),
      dealerId: record.dealerId,
      sku: record.sku,
      price: Number(record.price),
      // Bo trong -> `.default(1)` cua schema (ASM-03). Xem chu thich o `workbookRecord`.
      ...(nullableCell(record.minQuantity) === null
        ? {}
        : { minQuantity: Number(record.minQuantity) }),
      enabled: booleanCell(record.enabled, true),
      effectiveFrom: nullableCell(record.effectiveFrom),
      effectiveTo: nullableCell(record.effectiveTo),
    };
  }
  return {
    chatId: nullableCell(record.chatId),
    name: record.name,
    dealerId: nullableCell(record.dealerId),
    dealerReference: record.dealerReference || record.dealerId,
    branch: nullableCell(record.branch),
    enabled: booleanCell(record.enabled, true),
  };
}

function collectRows(
  resource: MasterDataImportResource,
  values: readonly unknown[],
  rows: ParsedMasterDataRow[],
  errors: MasterDataImportRowError[],
): void {
  values.forEach((value, index) => collectOne(resource, value, index + 1, undefined, rows, errors));
}

function collectOne(
  resource: MasterDataImportResource,
  value: unknown,
  rowNumber: number,
  sheet: string | undefined,
  rows: ParsedMasterDataRow[],
  errors: MasterDataImportRowError[],
): void {
  const schema =
    resource === 'dealer'
      ? importedDealerSchema
      : resource === 'deal'
        ? importedDealSchema
        : importedGroupSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    errors.push({
      resource,
      rowNumber,
      ...(sheet ? { sheet } : {}),
      message: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`)
        .join('; '),
    });
    return;
  }
  const shared = { resource, rowNumber, ...(sheet ? { sheet } : {}) };
  if (resource === 'dealer') rows.push({ ...shared, resource, value: parsed.data as ImportedDealer });
  if (resource === 'deal') rows.push({ ...shared, resource, value: parsed.data as ImportedDeal });
  if (resource === 'group') rows.push({ ...shared, resource, value: parsed.data as ImportedGroup });
}

function parseResource(value: unknown): MasterDataImportResource | undefined {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('vi');
  if (['dealer', 'dealers', 'đại lý', 'dai ly'].includes(normalized)) return 'dealer';
  if (['deal', 'deals', 'override', 'overrides', 'deal riêng', 'deal rieng'].includes(normalized)) {
    return 'deal';
  }
  if (['group', 'groups', 'nhóm', 'nhom'].includes(normalized)) return 'group';
  return undefined;
}

function splitAliases(value: string): string[] {
  return value
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value).trim();
}

function nullableCell(value: unknown): string | null {
  const text = cellText(value);
  return text || null;
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  return Number(cellText(value).replace(/[.,\s]/g, ''));
}

function booleanCell(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = cellText(value).toLocaleLowerCase('vi');
  if (['true', '1', 'yes', 'có', 'co', 'bật', 'bat'].includes(normalized)) return true;
  if (['false', '0', 'no', 'không', 'khong', 'tắt', 'tat'].includes(normalized)) return false;
  return fallback;
}

function parseMetadata(value: string | undefined): Record<string, unknown> | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { note: value.trim() };
  }
}
