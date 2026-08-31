import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type FuelStatementMappingPolicy } from './fuel-policy.js';
import {
  mapStatementRows,
  missingStatementColumns,
  normalizePlate,
  parseStatementAmount,
  parseStatementDate,
  parseStatementLiters,
} from './fuel-statement-mapping.js';
import { FileFuelStatementSource } from './fuel-statement-source.js';
import type { FuelStatementFormat } from './fuel.types.js';

/**
 * NHAP BANG KE — `GD-07`, tren FILE THAT.
 *
 * Hai fixture (`bang-ke-mau.csv` va `bang-ke-mau.xlsx`) la du lieu TONG HOP, dung theo `GD-07`
 * ("demo dung file tong hop"): khong bien so that, khong hoa don that, khong cay xang that.
 *
 * Chung co CUNG NOI DUNG, va do la mot phep do co chu dich: hai adapter khac nhau doc ra CUNG mot
 * ket qua nghiep vu. Neu mot ngay nao do ban XLSX doc lech mot dong (o trong, o ngay, o so), bai
 * test nay do — thay vi mot khach phat hien ra bang cach doi soat sai mot thang.
 *
 * Moi dong trong fixture co MOT viec: hai dong dung, va sau dong hong theo sau kieu KHAC NHAU.
 * Do la cach "khong doan ngam" duoc do: mot bo loc im lang se lam ca sau dong bien mat, va bai
 * test nay se thay so dong bi thieu.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const MAPPING: FuelStatementMappingPolicy = {
  columns: DEFAULT_FUEL_STATEMENT_COLUMNS,
  dateFormat: 'iso',
};

/** Doi xe cua bai test: DUY NHAT bien so `29C-123.45` ton tai. */
const VEHICLES = new Map([[normalizePlate('29C-123.45'), 'xe-1']]);

const read = (filename: string, format: FuelStatementFormat) =>
  new FileFuelStatementSource().read({
    filename,
    format,
    content: readFileSync(join(FIXTURES, filename)),
  });

const CASES: ReadonlyArray<[string, FuelStatementFormat]> = [
  ['bang-ke-mau.csv', 'CSV'],
  ['bang-ke-mau.xlsx', 'XLSX'],
];

describe.each(CASES)('Bang ke mau — %s', (filename, format) => {
  it('doc duoc hang tieu de va dung so dong du lieu', async () => {
    const parsed = await read(filename, format);

    expect(parsed.headers).toEqual([
      'Bien so',
      'Ngay',
      'So lit',
      'Thanh tien',
      'So hoa don',
      'Ghi chu',
    ]);
    expect(parsed.rows).toHaveLength(8);
    // `rowNumber` dem theo FILE, khong theo mang: dong du lieu dau tien la dong 2 trong Excel.
    expect(parsed.rows[0]?.rowNumber).toBe(2);
    expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('anh xa cot cua goi khach khop hang tieu de cua file', async () => {
    const parsed = await read(filename, format);
    expect(missingStatementColumns([...parsed.headers], MAPPING)).toEqual([]);
  });

  /**
   * BAI TEST TRUNG TAM: sau ly do tu choi, moi ly do dung mot dong, khong dong nao bi bo im lang.
   *
   * Doi CHINH XAC tung dong mot chu khong chi dem tong: mot bo loc doc nham cot van co the cho ra
   * "2 nhan, 6 tu choi" ma moi ly do deu sai.
   */
  it('cho ra ket qua theo TUNG DONG, moi duong tu choi mot ma rieng', async () => {
    const parsed = await read(filename, format);
    const lines = mapStatementRows({
      rows: parsed.rows,
      mapping: MAPPING,
      vehicleIdByNormalizedPlate: VEHICLES,
    });

    expect(lines.map((line) => [line.rowNumber, line.status, line.rejectReason])).toEqual([
      [2, 'ACCEPTED', null],
      [3, 'ACCEPTED', null],
      [4, 'REJECTED', 'UNKNOWN_VEHICLE'],
      [5, 'REJECTED', 'MALFORMED_DATE'],
      [6, 'REJECTED', 'MALFORMED_LITERS'],
      [7, 'REJECTED', 'MALFORMED_AMOUNT'],
      [8, 'REJECTED', 'MISSING_REQUIRED_FIELD'],
      [9, 'REJECTED', 'DUPLICATE_ROW'],
    ]);
  });

  it('dong duoc nhan mang du so lieu de so khop, doc dung don vi', async () => {
    const parsed = await read(filename, format);
    const lines = mapStatementRows({
      rows: parsed.rows,
      mapping: MAPPING,
      vehicleIdByNormalizedPlate: VEHICLES,
    });

    expect(lines[0]).toMatchObject({
      vehicleId: 'xe-1',
      businessDate: '2026-08-05',
      litersUnits: 200_000,
      amount: 4_200_000,
      invoiceNo: 'HD001',
    });
    expect(lines[1]).toMatchObject({
      businessDate: '2026-08-12',
      litersUnits: 150_500,
      amount: 3_160_500,
    });
  });

  /**
   * DONG BI TU CHOI VAN DUOC GIU, va cac o so lieu cua no de `null`.
   *
   * Do la ca noi dung cua "khong doan ngam": neu dong hong bi bo di luc nhap thi nguoi doi soat
   * nhin thay mot bang ke thieu dong ma khong biet thieu bao nhieu, va so tong cua ho se khong bao
   * gio khop voi ban giay.
   */
  it('dong bi tu choi giu nguyen ban goc va KHONG mang gia tri bia', async () => {
    const parsed = await read(filename, format);
    const lines = mapStatementRows({
      rows: parsed.rows,
      mapping: MAPPING,
      vehicleIdByNormalizedPlate: VEHICLES,
    });

    const malformedDate = lines.find((line) => line.rejectReason === 'MALFORMED_DATE');
    expect(malformedDate).toMatchObject({
      businessDate: null,
      litersUnits: null,
      amount: null,
      vehicleId: null,
      vehiclePlateRaw: '29C-123.45',
    });
    expect(malformedDate?.rawValues.Ngay).toBe('32/08/2026');
  });
});

describe('Hai adapter doc ra CUNG mot ket qua nghiep vu', () => {
  it('CSV va XLSX cho ra cung bo dong, chi khac dau van tay file', async () => {
    const [csv, xlsx] = await Promise.all([
      read('bang-ke-mau.csv', 'CSV'),
      read('bang-ke-mau.xlsx', 'XLSX'),
    ]);

    const linesOf = (parsed: Awaited<ReturnType<typeof read>>) =>
      mapStatementRows({
        rows: parsed.rows,
        mapping: MAPPING,
        vehicleIdByNormalizedPlate: VEHICLES,
      });

    expect(linesOf(xlsx)).toEqual(linesOf(csv));
    // Van tay la cua BYTE, nen hai file khac nhau phai co hai van tay khac nhau.
    expect(xlsx.digest).not.toBe(csv.digest);
  });
});

describe('Cua vao file — tu choi som, co ma', () => {
  it('file rong bi tu choi truoc khi doc dong nao', async () => {
    await expect(
      new FileFuelStatementSource().read({
        filename: 'rong.csv',
        format: 'CSV',
        content: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({ reason: 'FUEL_STATEMENT_EMPTY' });
  });

  it('byte khong phai XLSX bi tu choi voi ma dinh dang, khong phai mot loi may chu', async () => {
    await expect(
      new FileFuelStatementSource().read({
        filename: 'hong.xlsx',
        format: 'XLSX',
        content: Buffer.from('day khong phai mot workbook'),
      }),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });

  it('anh xa cot sai duoc phat hien o cap FILE, khong phai tung dong', () => {
    expect(missingStatementColumns(['Bien so', 'Ngay'], MAPPING)).toEqual(['liters', 'amount']);
  });
});

describe('Doc mot o — luat HEP, khong doan', () => {
  it('bien so chuan hoa du bo dau cham, gach va khoang trang', () => {
    expect(normalizePlate('29C-123.45')).toBe('29C12345');
    expect(normalizePlate('29c 12345')).toBe('29C12345');
    // ...nhung KHONG lam hai bien so khac nhau gap nhau.
    expect(normalizePlate('29C-123.46')).not.toBe(normalizePlate('29C-123.45'));
  });

  it('so tien doc dau cham la phan cach hang nghin (VND khong co don vi phu)', () => {
    expect(parseStatementAmount('4.200.000')).toBe(4_200_000);
    expect(parseStatementAmount('4 200 000')).toBe(4_200_000);
    expect(parseStatementAmount('4200000')).toBe(4_200_000);
    // Phan cach dat sai cho thi TU CHOI, khong doan.
    expect(parseStatementAmount('4.20')).toBeNull();
    expect(parseStatementAmount('1,9tr')).toBeNull();
  });

  /**
   * SO LIT thi NGUOC LAI: dau phan cach LUON la thap phan.
   *
   * `1.500` co the la 1.500 lit hay 1,5 lit, va khong cach nao biet chac. Doan mot trong hai la
   * sai 1000 lan o mot nua so lan doan — nen luat o day hep va tu choi thay vi doan.
   */
  it('so lit chi nhan MOT dau phan cach, va no luon la thap phan', () => {
    expect(parseStatementLiters('150.5')).toBe(150_500);
    expect(parseStatementLiters('150,5')).toBe(150_500);
    expect(parseStatementLiters('1.500.25')).toBeNull();
    expect(parseStatementLiters('abc')).toBeNull();
  });

  it('ngay doc dung dang goi khach khai, khong tu doan dang khac', () => {
    expect(parseStatementDate('2026-08-05', 'iso')).toBe('2026-08-05');
    expect(parseStatementDate('05/08/2026', 'iso')).toBeNull();

    expect(parseStatementDate('05/08/2026', 'dmy')).toBe('2026-08-05');
    expect(parseStatementDate('2026-08-05', 'dmy')).toBeNull();

    // Dung dang nhung khong phai mot ngay co that.
    expect(parseStatementDate('2026-02-30', 'iso')).toBeNull();
  });
});
