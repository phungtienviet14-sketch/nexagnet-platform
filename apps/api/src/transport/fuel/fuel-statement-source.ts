import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import readXlsxFile from 'read-excel-file/node';
import { TransportDomainError } from '../transport.errors.js';
import type { RawStatementRow } from './fuel-statement-mapping.js';
import type { FuelStatementFormat } from './fuel.types.js';

/**
 * `FuelStatementSourcePort` cua `GD-07` — CUA VAO DUY NHAT cua mot bang ke cay xang.
 *
 * ===========================================================================
 * VI SAO LA MOT CONG chu khong phai mot ham:
 *
 * `GD-07` gia dinh bang ke vao bang CSV/Excel "vi khong cay xang quy mo nay co API". Do la mot gia
 * dinh ve HOM NAY, khong phai ve mai sau — va cot "chi phi dao nguoc" cua no ghi la **thap**, dung
 * mot dieu kien: co mot cong o dung cho. Khi mot cay xang mo API, thu phai them la mot adapter thu
 * ba sau cong nay; khong dong nao cua `fuel-statement.service.ts` phai doi.
 *
 * Neu doc file duoc goi thang trong service, thi "adapter API" se phai chen vao giua mot ham dang
 * doc `Buffer` — va luc do chi phi dao nguoc khong con thap nua.
 *
 * ===========================================================================
 * CONG NAY KHONG BIET GI VE NGHIEP VU. No tra ve HANG TIEU DE va CAC O, nguyen ban dang chuoi.
 *
 * Viec hieu mot dong (anh xa cot, doc ngay, doc tien) la cua `fuel-statement-mapping.ts`, va do la
 * mot tep THUAN co bo test rieng. Nho tach nhu vay, "doc duoc file khong" va "dong 14 co ngay hong"
 * la hai cau hoi doc lap — thay vi mot ham vua mo zip vua phan tich ngay thang.
 */

export interface FuelStatementFile {
  /** Ten file nguon, de nguoi doi soat tim lai ban giay. Khong phai duong dan he thong tep. */
  readonly filename: string;
  readonly format: FuelStatementFormat;
  readonly content: Buffer;
}

export interface ParsedStatementFile {
  readonly headers: readonly string[];
  readonly rows: readonly RawStatementRow[];
  /** SHA-256 cua BYTE goc. Hai lan nhap cung mot file vao hai ky khac nhau van doc ra duoc. */
  readonly digest: string;
}

export abstract class FuelStatementSource {
  abstract read(file: FuelStatementFile): Promise<ParsedStatementFile>;
}

/** Bang ke ~10 xe mot thang. Bien nay chan mot file nham chu khong phai mot gioi han nghiep vu. */
const MAX_STATEMENT_BYTES = 5_000_000;

/**
 * Hien thuc DUY NHAT hom nay: doc mot FILE da nam trong bo nho.
 *
 * `csv-parse` va `read-excel-file` deu DA la phu thuoc cua `@netviet/api` va da duoc dung chung o
 * `settings/master-data-import.ts`. Khong them phu thuoc nao cho T4 — mot ham nhap lieu thu hai
 * keo theo mot thu vien doc Excel thu hai la cach hai duong nhap troi khoi nhau ve sau.
 */
@Injectable()
export class FileFuelStatementSource extends FuelStatementSource {
  async read(file: FuelStatementFile): Promise<ParsedStatementFile> {
    if (file.content.byteLength === 0) {
      throw TransportDomainError.invalid('FUEL_STATEMENT_EMPTY', `File ${file.filename} rong`);
    }
    if (file.content.byteLength > MAX_STATEMENT_BYTES) {
      throw TransportDomainError.invalid(
        'FUEL_STATEMENT_FORMAT_UNSUPPORTED',
        `File ${file.filename} vuot gioi han ${MAX_STATEMENT_BYTES} byte`,
      );
    }

    const matrix = file.format === 'CSV' ? this.readCsv(file) : await this.readWorkbook(file);
    return { ...toRows(matrix), digest: digestOf(file.content) };
  }

  /**
   * `bom: true` khong phai mot chi tiet vun vat.
   *
   * Excel tren Windows luu CSV kem BOM UTF-8, va khong bo BOM thi ky tu dau tien cua TIEU DE DAU
   * TIEN mang mot ky tu vo hinh. Ket qua: cot `Bien so` khong khop `Bien so`, moi dong bi tu choi,
   * va thong diep loi noi ve mot cot trong nhu co that. Kieu hong ton nhieu gio nhat de tim.
   */
  private readCsv(file: FuelStatementFile): string[][] {
    try {
      return parseCsv(file.content, {
        bom: true,
        skipEmptyLines: true,
        relaxColumnCount: true,
        trim: true,
      }) as string[][];
    } catch (error) {
      throw TransportDomainError.invalid(
        'FUEL_STATEMENT_FORMAT_UNSUPPORTED',
        `File CSV ${file.filename} khong doc duoc: ${describe(error)}`,
      );
    }
  }

  /**
   * Sheet DAU TIEN. Bang ke cua mot cay xang la mot bang; nhieu sheet la mot gia dinh khong ai noi.
   *
   * `readXlsxFile(buffer)` cua ban 9.x tra ve CA DANH SACH SHEET (`{ sheet, data }[]`), khong phai
   * cac hang cua sheet dau — dung nhu `settings/master-data-import.ts` dang dung. Lay `[0].data` la
   * cach doc sheet dau ma khong them mot loi import thu hai.
   */
  private async readWorkbook(file: FuelStatementFile): Promise<string[][]> {
    try {
      const sheets = await readXlsxFile(file.content);
      const rows = sheets[0]?.data ?? [];
      return rows.map((row) => row.map(cellText));
    } catch (error) {
      throw TransportDomainError.invalid(
        'FUEL_STATEMENT_FORMAT_UNSUPPORTED',
        `File XLSX ${file.filename} khong doc duoc: ${describe(error)}`,
      );
    }
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * MOT O -> CHUOI.
 *
 * `Date` duoc doi ve `YYYY-MM-DD` theo cac phan UTC. Ly do: o ngay cua Excel la mot SO (so ngay ke
 * tu 1899-12-30) khong mang mui gio nao, va `read-excel-file` dung no thanh mot `Date` o UTC nua
 * dem. Doc lai bang gio DIA PHUONG cua may chu se lui mot ngay o moi mui gio am — mot loi chi lo ra
 * khi ai do chay he thong ngoai Viet Nam, tuc rat muon.
 *
 * `number` di qua `String()` chu khong qua mot bo dinh dang theo locale: bo do se chen dau phan
 * cach hang nghin vao mot con so ma tang sau sap doc lai, va tang do co luat RIENG ve dau phan
 * cach (xem `fuel-statement-mapping.ts`).
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).trim();
}

/**
 * HANG DAU LA TIEU DE, cac hang sau la du lieu — va `rowNumber` dem theo FILE, khong theo mang.
 *
 * `index + 2` chu khong `index + 1`: nguoi doi soat se mo file trong Excel de tim dong, va o do
 * dong 1 la tieu de. Lech mot dong o cho nay bien mot thong diep loi chinh xac thanh mot thong
 * diep gan dung — thu con te hon vi no lam nguoi ta sua nham dong.
 */
function toRows(matrix: string[][]): { headers: string[]; rows: RawStatementRow[] } {
  const [headerRow = [], ...dataRows] = matrix;
  const headers = headerRow.map((cell) => cell.trim());

  const rows: RawStatementRow[] = [];
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

const digestOf = (content: Buffer): string => createHash('sha256').update(content).digest('hex');
