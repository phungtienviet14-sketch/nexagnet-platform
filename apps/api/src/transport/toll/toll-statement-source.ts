import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import readXlsxFile from 'read-excel-file/node';
import { TransportDomainError } from '../transport.errors.js';
import { tollSourceDigest } from './toll-identity.js';
import type { RawTollRow } from './toll-statement-mapping.js';

/**
 * CUA VAO DUY NHAT cua mot tep nguon ETC.
 *
 * ===========================================================================
 * CONG NAY KHONG BIET GI VE NGHIEP VU. No tra ve HANG TIEU DE va CAC O, nguyen ban dang chuoi.
 *
 * Viec hieu mot dong (anh xa cot, doc ngay, doc tien) la cua `toll-statement-mapping.ts`. Nho tach
 * nhu vay, "doc duoc tep khong" va "dong 14 co ngay hong" la hai cau hoi doc lap.
 *
 * Va no la mot CONG chu khong phai mot ham vi mot ly do da co ten: neu mot ngay nao do co mot
 * duong `API` that (ND 119 D.26 kh.2 dat san nghia vu do — xem tai lieu nghien cuu §1.3), thu phai
 * them la mot hien thuc sau cong nay, khong phai mot nhanh `if` giua mot ham dang doc `Buffer`.
 */

export const TOLL_FILE_FORMATS = ['CSV', 'XLSX'] as const;
export type TollFileFormat = (typeof TOLL_FILE_FORMATS)[number];

export interface TollSourceFile {
  /** Ten tep nguon, de nguoi doi soat tim lai ban goc. KHONG phai duong dan he thong tep. */
  readonly filename: string;
  readonly format: TollFileFormat;
  readonly content: Buffer;
  readonly maxBytes: number;
  readonly maxRows: number;
}

export interface ParsedTollSource {
  readonly headers: readonly string[];
  readonly rows: readonly RawTollRow[];
  readonly digest: string;
}

export abstract class TollStatementSource {
  abstract read(file: TollSourceFile): Promise<ParsedTollSource>;
}

/**
 * Hien thuc DUY NHAT hom nay: doc mot TEP da nam trong bo nho.
 *
 * `csv-parse` va `read-excel-file` DA la phu thuoc cua `@netviet/api`. Khong them phu thuoc nao —
 * mot duong nhap thu hai keo theo mot thu vien doc Excel thu hai la cach hai duong nhap troi khoi
 * nhau ve sau.
 */
@Injectable()
export class FileTollStatementSource extends TollStatementSource {
  async read(file: TollSourceFile): Promise<ParsedTollSource> {
    if (file.content.byteLength === 0) {
      throw TransportDomainError.invalid('TOLL_IMPORT_EMPTY', `Tep ${file.filename} rong`);
    }
    /*
     * BIEN BYTE do TRUOC khi mo tep.
     *
     * #269 J9 doi *"import size/row bounds prevent unbounded memory use"*. Kiem sau khi da giai nen
     * mot workbook la kiem qua muon: chinh phep mo do la cho bo nho bi an.
     */
    if (file.content.byteLength > file.maxBytes) {
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_TOO_LARGE',
        `Tep ${file.filename} vuot gioi han ${String(file.maxBytes)} byte`,
      );
    }

    const matrix = file.format === 'CSV' ? this.readCsv(file) : await this.readWorkbook(file);
    const parsed = toRows(matrix);

    if (parsed.rows.length > file.maxRows) {
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_TOO_LARGE',
        `Tep ${file.filename} co ${String(parsed.rows.length)} dong, vuot gioi han ${String(file.maxRows)}`,
      );
    }

    return { ...parsed, digest: tollSourceDigest(file.content) };
  }

  /**
   * `bom: true` khong phai mot chi tiet vun vat: Excel tren Windows luu CSV kem BOM UTF-8, va
   * khong bo BOM thi TIEU DE DAU TIEN mang mot ky tu vo hinh — cot `So tai khoan` khong khop
   * `So tai khoan`, moi dong bi tu choi, va thong diep loi noi ve mot cot trong nhu co that.
   */
  private readCsv(file: TollSourceFile): string[][] {
    try {
      return parseCsv(file.content, {
        bom: true,
        skipEmptyLines: true,
        relaxColumnCount: true,
        trim: true,
      }) as string[][];
    } catch (error) {
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_FORMAT_UNSUPPORTED',
        `Tep CSV ${file.filename} khong doc duoc: ${describe(error)}`,
      );
    }
  }

  private async readWorkbook(file: TollSourceFile): Promise<string[][]> {
    try {
      const sheets = await readXlsxFile(file.content);
      const rows = sheets[0]?.data ?? [];
      return rows.map((row) => row.map(cellText));
    } catch (error) {
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_FORMAT_UNSUPPORTED',
        `Tep XLSX ${file.filename} khong doc duoc: ${describe(error)}`,
      );
    }
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * MOT O -> CHUOI. Khong o nao duoc TINH, chi duoc DOC.
 *
 * #269 J9: *"malformed formula/spreadsheet content is treated as data; no shell/CSV formula
 * execution"*. Mot o `=cmd|/c calc` di qua day thanh dung chuoi do — `read-excel-file` tra ve gia
 * tri o chu khong chay cong thuc, va `String()` khong dien giai gi.
 *
 * `Date` doi ve `YYYY-MM-DD` theo cac phan UTC: o ngay cua Excel la mot SO khong mang mui gio nao,
 * va doc lai bang gio DIA PHUONG cua may chu se lui mot ngay o moi mui gio am.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${String(year)}-${month}-${day}`;
  }
  return String(value).trim();
}

/**
 * HANG DAU LA TIEU DE; `rowNumber` dem theo TEP, khong theo mang.
 *
 * `index + 2` chu khong `index + 1`: nguoi doi soat se mo tep trong Excel de tim dong, va o do
 * dong 1 la tieu de. Lech mot dong bien mot thong diep loi chinh xac thanh mot thong diep gan
 * dung — thu con te hon vi no lam nguoi ta sua nham dong.
 */
function toRows(matrix: string[][]): { headers: string[]; rows: RawTollRow[] } {
  const [headerRow = [], ...dataRows] = matrix;
  const headers = headerRow.map((cell) => cell.trim());

  const rows: RawTollRow[] = [];
  dataRows.forEach((row, index) => {
    if (row.every((cell) => cell.trim() === '')) return;
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header !== '') values[header] = (row[column] ?? '').trim();
    });
    rows.push({ rowNumber: index + 2, values });
  });

  return { headers, rows };
}
