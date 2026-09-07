import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua mo hinh van chuyen v2 (R1-B).
 *
 * Bo test nay KHONG cham co so du lieu: no doc chinh tep migration nhu VAN BAN. Ly do da ghi o
 * khoi canh bao dau muc Transport trong `schema.prisma` -- Prisma khong co cu phap cho `CHECK`
 * lan cho `WHERE` tren index, nen chung song trong SQL tho, va `prisma migrate dev` SE sinh lenh
 * xoa chung neu ai do chay no roi commit thang. Bo test nay la day bao cho viec do.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260907190000_transport_movement',
);
const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

describe('tang luu tru cua mo hinh van chuyen v2 (R1-B)', () => {
  it.each([
    'TransportRunLeg_empty_carries_no_order',
    'TransportRunLeg_sequence_positive',
    'TransportRunLeg_distance_non_negative',
    'TransportOrder_freightAmount_money_range',
    'TransportOrder_code_not_blank',
    'TransportVehicleRun_code_not_blank',
  ])('migration van khai `%s`', (name) => {
    expect(migration).toContain(name);
  });

  it('BAT BIEN TRUNG TAM: chang EMPTY khong mang don, cuong che O DB', () => {
    expect(migration).toContain(`CHECK ("kind" = 'LOADED' OR "orderId" IS NULL)`);
  });

  it('mot ban phan cong DANG hieu luc cho moi vong chay -- unique MOT PHAN', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "TransportRunAssignment_activeRun_key"');
    expect(migration).toContain('ON "TransportRunAssignment"("runId") WHERE "effectiveTo" IS NULL');
  });

  it('mot chuyen v1 tuong ung TOI DA mot chang, va nguoc lai', () => {
    expect(migration).toContain('CONSTRAINT "TransportTripRunLegLink_pkey" PRIMARY KEY ("tripId")');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TransportTripRunLegLink_legId_key" ON "TransportTripRunLegLink"("legId")',
    );
  });

  it('khoang tien trung voi `money()` va voi chuyen v1', () => {
    expect(migration).toContain('BETWEEN -9007199254740991 AND 9007199254740991');
  });

  it('CHI THEM: khong `ALTER TABLE` mot bang cu nao, khong `DROP` gi', () => {
    const created = [
      'TransportOrder',
      'TransportVehicleRun',
      'TransportRunAssignment',
      'TransportRunLeg',
      'TransportTripRunLegLink',
    ];
    const alters = migration.match(/ALTER TABLE "(\w+)"/g) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const statement of alters) {
      const table = /ALTER TABLE "(\w+)"/.exec(statement)?.[1];
      expect(created).toContain(table);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/);
  });

  it('`TransportTrip` khong bi cham -- chi duoc TRO TOI bang khoa ngoai', () => {
    // Bang moi tro khoa ngoai VAO chuyen cu la cong them; SUA bang chuyen cu thi khong.
    expect(migration).toContain('REFERENCES "TransportTrip"("id")');
    expect(migration).not.toMatch(/ALTER TABLE "TransportTrip"/);
  });

  it('duong lui duoc ghi ra, va no go dung nhung doi tuong da tao', () => {
    for (const name of [
      'TransportTripRunLegLink',
      'TransportRunLeg',
      'TransportRunAssignment',
      'TransportVehicleRun',
      'TransportOrder',
      'TransportRunLegStatus',
      'TransportRunLegKind',
      'TransportVehicleRunStatus',
      'TransportOrderStatus',
    ]) {
      expect(rollback).toContain(name);
    }
  });

  it('duong lui noi ro no KHONG cham du lieu v1', () => {
    expect(rollback).toContain('TransportTrip` KHONG bi cham');
  });
});
