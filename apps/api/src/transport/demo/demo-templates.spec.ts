import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetTenantCache } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantTransportFuelPolicy } from '../fuel/fuel-policy.js';
import {
  mapStatementRows,
  missingStatementColumns,
  normalizePlate,
} from '../fuel/fuel-statement-mapping.js';
import { FileFuelStatementSource } from '../fuel/fuel-statement-source.js';
import { loadDemoMonthDataset } from './demo-dataset.js';

/**
 * BIEU MAU NHAP LIEU PHAI NHAP DUOC — khong phai mot tep CSV de xem cho vui.
 *
 * `#90` doi cac bieu mau onboarding, va cai bay hien nhien la giao mot tep CSV chua ai thu nhap
 * bao gio: ten cot lech mot dau cach, ngay viet kieu My, dau phay thap phan — moi loi do chi lo ra
 * o lan dau khach that mo phan mem len. Bai nay day CHINH tep duoc giao qua CHINH bo doc cua san
 * pham.
 *
 * Va no kiem ca chieu nguoc: mot dong hong phai bi TU CHOI KEM LY DO CO TEN, vi #90 doi bao cao
 * nhap lieu phai chi ro dong nao bi loai va vi sao.
 */

const TEMPLATES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../tenants/transport-preview/templates',
);

const readTemplate = (name: string): Buffer => readFileSync(join(TEMPLATES, name));

beforeAll(() => {
  process.env.TENANT = 'transport-preview';
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

afterAll(() => {
  delete process.env.TENANT;
  resetTenantCache();
});

describe('bieu mau bang ke cay xang di qua duoc bo doc that', () => {
  const source = new FileFuelStatementSource();

  const parse = async () =>
    source.read({
      filename: 'bang-ke-cay-xang.csv',
      format: 'CSV',
      content: readTemplate('bang-ke-cay-xang.csv'),
    });

  /**
   * BOM CUA EXCEL KHONG DUOC LAM HONG COT DAU TIEN.
   *
   * Bieu mau duoc luu KEM BOM UTF-8 co chu dich: khong co no, Excel tren Windows mo tep ra thanh
   * mot day ky tu vo nghia va nguoi dung ket luan phan mem khong ho tro tieng Viet. Bo doc da cat
   * BOM (`fuel-statement-source.ts`), va bai nay giu cho hai lua chon do khong bao gio lech nhau.
   */
  it('hang tieu de doc ra dung ten cot cua goi khach, khong dinh BOM', async () => {
    const parsed = await parse();
    const statement = tenantTransportFuelPolicy().statement;
    const columns = statement.columns;

    expect(parsed.headers[0]).toBe(columns.vehiclePlate);
    expect(missingStatementColumns(parsed.headers, statement)).toEqual([]);
  });

  it('moi dong cua bieu mau deu duoc CHAP NHAN', async () => {
    const parsed = await parse();
    const dataset = loadDemoMonthDataset();
    const vehicleIdByNormalizedPlate = new Map(
      dataset.vehicles.map((vehicle) => [normalizePlate(vehicle.plate), vehicle.ref]),
    );

    const mapped = mapStatementRows({
      rows: parsed.rows,
      mapping: tenantTransportFuelPolicy().statement,
      vehicleIdByNormalizedPlate,
    });

    expect(mapped.length).toBeGreaterThanOrEqual(3);
    for (const line of mapped) {
      expect(line.status, `dong ${line.rowNumber}: ${line.rejectReason ?? ''}`).toBe('ACCEPTED');
      expect(line.vehicleId, `dong ${line.rowNumber}`).not.toBeNull();
      expect(line.businessDate, `dong ${line.rowNumber}`).not.toBeNull();
      expect(line.litersUnits, `dong ${line.rowNumber}`).not.toBeNull();
      expect(line.amount, `dong ${line.rowNumber}`).not.toBeNull();
    }
  });

  /**
   * BIEN SO CUA BIEU MAU PHAI LA XE CO THAT TRONG BO DU LIEU MAU.
   *
   * Mot bieu mau dung bien so bia se nhap vao thanh toan dong `UNKNOWN_VEHICLE` — dung ve ky
   * thuat, nhung nguoi thu lan dau se ket luan chuc nang nhap bang ke khong chay.
   */
  it('bien so trong bieu mau deu la xe co trong bo du lieu mau', async () => {
    const parsed = await parse();
    const plates = new Set(loadDemoMonthDataset().vehicles.map((v) => normalizePlate(v.plate)));
    const statement = tenantTransportFuelPolicy().statement;
    const columns = statement.columns;

    for (const row of parsed.rows) {
      const raw = row.values[columns.vehiclePlate] ?? '';
      expect(plates, `dong ${row.rowNumber}`).toContain(normalizePlate(raw));
    }
  });

  /** Chieu nguoc lai: mot dong hong phai bi loai KEM LY DO, khong bi nuot im lang. */
  it('mot dong hong bi tu choi kem ly do co ten', () => {
    const statement = tenantTransportFuelPolicy().statement;
    const columns = statement.columns;
    const mapped = mapStatementRows({
      rows: [
        {
          rowNumber: 2,
          values: {
            [columns.vehiclePlate]: '99Z-999.99',
            [columns.businessDate]: '12/08/2026',
            [columns.liters]: '10.000',
            [columns.amount]: '210000',
          },
        },
        {
          rowNumber: 3,
          values: {
            [columns.vehiclePlate]: '29H-152.44',
            [columns.businessDate]: 'khong-phai-ngay',
            [columns.liters]: '10.000',
            [columns.amount]: '210000',
          },
        },
      ],
      mapping: statement,
      vehicleIdByNormalizedPlate: new Map([[normalizePlate('29H-152.44'), 'XE01']]),
    });

    expect(mapped[0]?.status).toBe('REJECTED');
    expect(mapped[0]?.rejectReason).toBe('UNKNOWN_VEHICLE');
    expect(mapped[1]?.status).toBe('REJECTED');
    expect(mapped[1]?.rejectReason).toBe('MALFORMED_DATE');
  });
});

describe('cac bieu mau con lai', () => {
  /**
   * KHONG BIEU MAU NAO DUOC MANG DU LIEU THAT.
   *
   * Bieu mau di kem san pham va se duoc mo ra trong cac buoi trinh dien. Mot so dien thoai hay mot
   * bien so that lot vao day la mot su co du lieu ca nhan, khong phai mot loi chinh ta. Neo chung
   * vao bo du lieu mau la cach lam cho dieu do kiem duoc bang may.
   */
  it('chi mang du lieu nghi ra, va khop voi bo du lieu mau', () => {
    const dataset = loadDemoMonthDataset();
    const knownPlates = new Set(dataset.vehicles.map((vehicle) => vehicle.plate));
    const knownPhones = new Set([
      ...dataset.drivers.map((driver) => driver.phone),
      ...dataset.customers.map((customer) => customer.phone),
      ...dataset.partners.map((partner) => partner.phone),
    ]);

    const vehicles = readTemplate('xe.csv').toString('utf8').split(/\r?\n/).slice(1);
    for (const line of vehicles.filter((row) => row.trim() !== '')) {
      expect(knownPlates, line).toContain(line.split(',')[0] as string);
    }

    const drivers = readTemplate('lai-xe.csv').toString('utf8').split(/\r?\n/).slice(1);
    for (const line of drivers.filter((row) => row.trim() !== '')) {
      expect(knownPhones, line).toContain(line.split(',')[1] as string);
    }
  });

  it('moi bieu mau deu co hang tieu de va it nhat mot dong vi du', () => {
    for (const name of [
      'xe.csv',
      'lai-xe.csv',
      'khach-hang.csv',
      'doi-tac.csv',
      'tuyen-duong.csv',
      'bang-ke-cay-xang.csv',
    ]) {
      const rows = readTemplate(name)
        .toString('utf8')
        .split(/\r?\n/)
        .filter((row) => row.trim() !== '');
      expect(rows.length, name).toBeGreaterThanOrEqual(2);
      expect(rows[0], name).toContain(',');
    }
  });
});
