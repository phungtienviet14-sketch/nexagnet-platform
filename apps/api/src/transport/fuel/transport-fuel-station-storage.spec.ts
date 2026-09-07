import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeStationCode, normalizeStationLabel } from './fuel-station-identity.js';

/**
 * CAC DOI TUONG DB CUA C1 KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Chung song trong SQL tho cua migration, va `prisma migrate dev` — von sinh migration bang cach
 * diff schema voi DB — se sinh lenh XOA tat ca. He thong van chay binh thuong sau do, chi khong
 * con chan gi ca: mot nua toa do, mot ban kinh khong tam, mot khoa so khop rong deu se lot vao
 * bang va nam do.
 *
 * Bo test nay doc CHINH tep migration va do neu mot ten khong con. No khong the hien constraint co
 * hieu luc hay khong — do la viec cua Postgres THAT. Cai no chan la mot lan "don dep" xoa mat
 * chung ma khong ai nhan ra.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260908090000_transport_fuel_station',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

/** Moi `CHECK` cua C1, kem cau mot dong ve dieu no giu. */
const CHECK_CONSTRAINTS: ReadonlyArray<readonly [string, string]> = [
  ['TransportFuelStation_name_not_blank', 'ten tram khong rong'],
  ['TransportFuelStation_nameNormalized_shape', 'khoa so khop theo ten dung khuon chuan hoa'],
  ['TransportFuelStation_code_paired', 'ma va ma-da-chuan-hoa cung co hoac cung khong'],
  ['TransportFuelStation_codeNormalized_shape', 'khoa so khop theo ma dung khuon chuan hoa'],
  ['TransportFuelStation_latitudeE7_range', 'vi do trong +-90 do o ty le 1e-7'],
  ['TransportFuelStation_longitudeE7_range', 'kinh do trong +-180 do o ty le 1e-7'],
  ['TransportFuelStation_coordinates_paired', 'mot nua toa do khong phai mot diem'],
  ['TransportFuelStation_geofence_needs_coordinates', 'ban kinh > 0 va phai co tam'],
  ['TransportFuelStationAlias_normalized_shape', 'bi danh dung khuon chuan hoa'],
  ['TransportFuelSupplier_paymentTermDays_range', 'ky han thanh toan 0..365 ngay'],
  ['TransportFuelSupplier_contractDates_iso', 'ngay hop dong dang YYYY-MM-DD'],
  ['TransportFuelSupplier_contract_period_order', 'ngay bat dau <= ngay ket thuc'],
];

const INDEXES: ReadonlyArray<readonly [string, boolean]> = [
  ['TransportFuelStation_supplierId_codeNormalized_key', true],
  ['TransportFuelStationAlias_normalized_key', true],
  ['TransportFuelStation_supplierId_status_idx', false],
  ['TransportFuelStation_codeNormalized_idx', false],
  ['TransportFuelStation_nameNormalized_idx', false],
];

describe('Rang buoc C1 phai con nguyen trong migration', () => {
  it.each(CHECK_CONSTRAINTS)('%s — %s', (name) => {
    expect(migration).toContain(`ADD CONSTRAINT "${name}"`);
  });

  it('dem du so `CHECK` — them mot cai moi ma quen bo test nay se do o day', () => {
    const declared = migration.match(/ADD CONSTRAINT "TransportFuel[^"]+"\s+CHECK/g) ?? [];
    expect(declared).toHaveLength(CHECK_CONSTRAINTS.length);
  });

  it.each(INDEXES)('chi so %s duoc tao', (name, unique) => {
    expect(migration).toContain(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX "${name}"`);
  });

  /**
   * MOT lan nhan dang doc `codeNormalized` VA `nameNormalized` bang mot cau `OR`, va Postgres chi
   * gop bitmap duoc khi CA HAI cot co chi so mot cot. Khoa unique `(supplierId, codeNormalized)`
   * KHONG phuc vu duoc: `codeNormalized` la cot thu hai cua no.
   *
   * Bo mot trong hai chi so di khong lam sai ket qua — no lam moi chung tu vao quet ca bang tram,
   * va dieu do chi lo ra o quy mo mot chuoi ban le that, tuc rat muon.
   */
  it('hai chi so mot cot cua duong nhan dang deu co mat', () => {
    expect(migration).toContain('ON "TransportFuelStation"("codeNormalized")');
    expect(migration).toContain('ON "TransportFuelStation"("nameNormalized")');
  });

  /** Khoa ngoai sang nha cung cap la `RESTRICT`: mot tram khong duoc bien mat theo mot lan xoa. */
  it('tram khong bi xoa lay theo nha cung cap, nhung bi danh thi di theo tram', () => {
    expect(migration).toContain(
      'REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'REFERENCES "TransportFuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });
});

/**
 * DUONG LUI PHAI GO DUNG NHUNG GI DUONG TIEN DAT VAO.
 *
 * Mot duong lui thieu mot cot se de lai mot cot mo coi tren bang cay xang cua khach — va lan sau
 * ai do chay lai migration, `ADD COLUMN` se do vi cot da ton tai.
 */
describe('Duong lui go dung nhung gi migration dat vao', () => {
  const ADDED_COLUMNS = [
    'contactName',
    'contactEmail',
    'contractNo',
    'contractStartDate',
    'contractEndDate',
    'paymentTermDays',
    'termsNote',
    'ingestChannels',
    'ingestAccountRef',
  ];

  it.each(ADDED_COLUMNS)('cot %s duoc them roi duoc go', (column) => {
    expect(migration).toContain(`ADD COLUMN "${column}"`);
    expect(rollback).toContain(`DROP COLUMN IF EXISTS "${column}"`);
  });

  it('hai bang moi va kieu enum moi deu duoc go', () => {
    expect(rollback).toContain('DROP TABLE IF EXISTS "TransportFuelStationAlias";');
    expect(rollback).toContain('DROP TABLE IF EXISTS "TransportFuelStation";');
    expect(rollback).toContain('DROP TYPE IF EXISTS "TransportFuelIngestChannel";');
  });

  /** Bang con truoc bang cha: `CASCADE` cua khoa ngoai lo phan xoa HANG, khong lo phan xoa BANG. */
  it('go bang con truoc bang cha', () => {
    expect(rollback.indexOf('DROP TABLE IF EXISTS "TransportFuelStationAlias"')).toBeLessThan(
      rollback.indexOf('DROP TABLE IF EXISTS "TransportFuelStation";'),
    );
  });

  it.each([
    'TransportFuelSupplier_paymentTermDays_range',
    'TransportFuelSupplier_contractDates_iso',
    'TransportFuelSupplier_contract_period_order',
  ])('rang buoc %s cua bang cu duoc go truoc khi go cot', (name) => {
    expect(rollback).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
  });
});

/**
 * SOI DAY GIUA PHEP CHUAN HOA (TypeScript) VA KHUON (SQL).
 *
 * Hai ban song o hai ngon ngu, va neu chung troi khoi nhau thi hong theo kieu te nhat: `INSERT` bi
 * Postgres tu choi voi mot thong diep khong mang ma nghiep vu nao, o dung luc nguoi dung vua bam
 * "Luu". Bai nay bat chung phai dong y voi nhau.
 */
describe('Khuon SQL va phep chuan hoa TypeScript noi cung mot thu', () => {
  const SQL_LABEL_SHAPE = /^[A-Z0-9]+( [A-Z0-9]+)*$/;
  const SQL_CODE_SHAPE = /^[A-Z0-9]+$/;

  it('khuon nam trong migration dung y nguyen chuoi tren', () => {
    expect(migration).toContain("~ '^[A-Z0-9]+( [A-Z0-9]+)*$'");
    expect(migration).toContain("~ '^[A-Z0-9]+$'");
  });

  it.each([
    'Cửa hàng xăng dầu số 5',
    'CHXD-số 5, Km12',
    'Đồng Đăng',
    'Trạm   nhiều    khoảng   trắng',
    'PVOIL Easy — Trạm 12/A',
  ])('`normalizeStationLabel(%s)` luon dung khuon cua SQL', (raw) => {
    const normalized = normalizeStationLabel(raw);
    expect(normalized).not.toBe('');
    expect(SQL_LABEL_SHAPE.test(normalized)).toBe(true);
  });

  it.each(['ch-05', 'CH 05', 'Số 12/A', 'plx.01'])(
    '`normalizeStationCode(%s)` luon dung khuon cua SQL',
    (raw) => {
      const normalized = normalizeStationCode(raw);
      expect(normalized).not.toBeNull();
      expect(SQL_CODE_SHAPE.test(normalized as string)).toBe(true);
    },
  );
});
