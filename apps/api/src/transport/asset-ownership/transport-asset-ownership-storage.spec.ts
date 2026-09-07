import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * BON DOI TUONG DB CUA `TX-08` KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Ba `CHECK` va mot unique MOT PHAN song trong SQL tho cua migration. `prisma migrate dev` — von
 * sinh migration bang cach diff schema voi DB — se sinh lenh xoa ca bon. He thong van chay binh
 * thuong sau do, chi khong con chan gi:
 *
 *   · mot ty le `0`, am, hay `20000` diem co ban se ghi duoc;
 *   · mot khoang thoi gian di nguoc se ghi duoc, va moi phep hoi "ai so huu tai thoi diem T" se
 *     tra ve rong o dung khoang do ma khong co gi noi len rang hang do sai;
 *   · MOT NGUOI SE CO HAI TY LE SONG SONG tren cung mot xe, va tong so huu se dem doi ho — bat
 *     bien 10000 diem sai ma khong bao loi o dau ca.
 *
 * Bo test nay doc CHINH tep migration va do neu mot ten khong con. No khong the hien constraint co
 * hieu luc hay khong — do la viec cua mot bai tren Postgres THAT. Cai no chan la mot lan "don dep"
 * xoa mat chung ma khong ai nhan ra.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260909140000_transport_asset_ownership',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

describe('tang luu tru cua so dang ky so huu (TX-08)', () => {
  it.each([
    'TransportAssetStakeholder_displayName_not_blank',
    'TransportVehicleOwnershipInterest_bps_range',
    'TransportVehicleOwnershipInterest_period_order',
  ])('migration van khai `%s`', (name) => {
    expect(migration).toContain(name);
  });

  /**
   * BAT BIEN CUA CA TRANCHE: mot ban DANG hieu luc cho moi cap `(xe, ben huu quan)`.
   *
   * Unique phai la MOT PHAN (`WHERE "effectiveTo" IS NULL`). Neu ai do bo menh de `WHERE`, cau
   * lenh van chay va van co ve dung — nhung luc do khong ai dong duoc mot quyen loi roi mo lai
   * mot quyen loi moi cho cung nguoi do tren cung chiec xe, tuc LICH SU khong ghi duoc nua.
   */
  it('unique cap dang hieu luc la unique MOT PHAN, khong phai unique toan bang', () => {
    const start = migration.indexOf('TransportVehicleOwnershipInterest_activePair_key');
    expect(start).toBeGreaterThan(-1);
    expect(migration.slice(start, start + 300)).toContain('WHERE "effectiveTo" IS NULL');
  });

  /** Khoang 1..10000 phai o trong SQL, khong chi o zod: mot duong ghi khac se khong di qua zod. */
  it('khoang diem co ban duoc cuong che o tang DB', () => {
    const start = migration.indexOf('TransportVehicleOwnershipInterest_bps_range');
    const clause = migration.slice(start, start + 200);
    expect(clause).toContain('>= 1');
    expect(clause).toContain('<= 10000');
  });

  /**
   * HAI COT tren `TransportVehicle` phai co `DEFAULT`.
   *
   * Thieu `DEFAULT` thi `ALTER TABLE ... ADD COLUMN ... NOT NULL` do tren mot bang co du lieu, va
   * lan deploy len stack dang chay se dung o buoc migrate.
   */
  it.each([
    ['operationalControl', "DEFAULT 'INTERNAL_OPERATED'"],
    ['ownershipRegisterComplete', 'DEFAULT false'],
  ])('cot `%s` duoc them kem gia tri mac dinh', (column, fallback) => {
    const start = migration.indexOf(`ADD COLUMN "${column}"`);
    expect(start, `khong tim thay cot ${column}`).toBeGreaterThan(-1);
    expect(migration.slice(start, start + 200)).toContain(fallback);
  });

  /** Khoa ngoai la `RESTRICT`: xoa mot chiec xe khong duoc lang le keo theo lich su so huu cua no. */
  it.each(['vehicleId', 'stakeholderId'])('khoa ngoai `%s` la RESTRICT chu khong CASCADE', (fk) => {
    const start = migration.indexOf(`TransportVehicleOwnershipInterest_${fk}_fkey`);
    expect(start).toBeGreaterThan(-1);
    expect(migration.slice(start, start + 250)).toContain('ON DELETE RESTRICT');
  });

  it('duong lui go dung nhung gi migration da them', () => {
    for (const object of [
      'TransportVehicleOwnershipInterest',
      'TransportAssetStakeholder',
      'ownershipRegisterComplete',
      'operationalControl',
      'TransportVehicleOperationalControl',
      'TransportAssetStakeholderKind',
    ]) {
      expect(rollback).toContain(object);
    }
  });
});
