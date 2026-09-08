import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua lop lap ke hoach vong chay (#276, Lane L).
 *
 * Bo test nay KHONG cham co so du lieu: no doc chinh tep migration nhu VAN BAN. Ly do da ghi o
 * khoi canh bao dau muc Transport trong `schema.prisma` — Prisma khong co cu phap cho `CHECK`,
 * cho `WHERE` tren index lan cho `TRIGGER`, nen chung song trong SQL tho, va `prisma migrate dev`
 * SE sinh lenh xoa chung neu ai do chay no roi commit thang. Bo test nay la day bao cho viec do.
 *
 * `#276` L9 bai 18 doi *"mutation tests removing grouping gate, closure guard, or completed-leg
 * immutability go red"*. Ba cong do co hai lop: mot cong o tang mien (co bai kiem rieng) va mot
 * rang buoc o tang kho. Go BAT KY ten nao duoi day khoi migration se lam bo nay do.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260911140000_transport_run_planning',
);
const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

describe('tang luu tru cua lop lap ke hoach vong chay (#276 Lane L)', () => {
  it.each([
    'TransportRunLeg_planned_distance_non_negative',
    'TransportOrderRunPlan_legs_distinct',
    'TransportOrderRunPlan_cancellation_paired',
    'TransportOrderRunPlan_plannedBy_not_blank',
    'TransportOrderRunPlan_activeOrder_key',
    'TransportOrderRunPlan_oneOrderPerRun_key',
    'TransportOrderRunPlan_idempotencyKey_key',
    'transport_run_leg_completed_is_immutable',
  ])('migration van khai `%s`', (name) => {
    expect(migration).toContain(name);
  });

  it('MOT ke hoach dang hieu luc cho moi don -- unique MOT PHAN, khong unique tron', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "TransportOrderRunPlan_activeOrder_key"');
    expect(migration).toContain(
      'ON "TransportOrderRunPlan"("orderId") WHERE "cancelledAt" IS NULL',
    );
  });

  it('bai 18 -- CONG GOM NHOM song o DB: che do ONE cam ke hoach thu hai tren mot vong chay', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "TransportOrderRunPlan_oneOrderPerRun_key"');
    expect(migration).toContain(`WHERE "cancelledAt" IS NULL AND "grouping" = 'ONE_ORDER_PER_RUN'`);
  });

  it('bai 18 -- BAT BIEN CHANG DA HOAN THANH song o DB bang trigger, khong chi o tang dich vu', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "transport_run_leg_completed_is_immutable"',
    );
    expect(migration).toContain('BEFORE UPDATE ON "TransportRunLeg"');
    for (const column of [
      'runId',
      'sequence',
      'kind',
      'orderId',
      'originLabel',
      'destinationLabel',
      'status',
    ]) {
      expect(migration).toContain(`NEW."${column}" IS DISTINCT FROM OLD."${column}"`);
    }
  });

  it('km NHAP TAY va `note` CO Y khong bi trigger khoa -- chung ve sau khi chang da dong', () => {
    expect(migration).not.toContain('NEW."distanceKm" IS DISTINCT FROM OLD."distanceKm"');
    expect(migration).not.toContain('NEW."note" IS DISTINCT FROM OLD."note"');
  });

  it('km DU KIEN khong am, nhung `NULL` van duoc phep -- "chua biet" khac 0', () => {
    expect(migration).toContain('CHECK ("plannedDistanceKm" IS NULL OR "plannedDistanceKm" >= 0)');
  });

  it('huy phai co ly do, va co ly do phai la da huy', () => {
    expect(migration).toContain('CHECK (("cancelledAt" IS NULL) = ("cancellationReason" IS NULL))');
  });

  it('chang rong va chang co hang cua cung mot ke hoach khong duoc la MOT hang', () => {
    expect(migration).toContain('CHECK ("emptyLegId" IS NULL OR "emptyLegId" <> "loadedLegId")');
  });

  it('CHI THEM: khong `DROP` gi, va chi `ALTER TABLE` dung hai bang', () => {
    const allowed = ['TransportRunLeg', 'TransportOrderRunPlan'];
    const alters = migration.match(/ALTER TABLE "(\w+)"/g) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const statement of alters) {
      expect(allowed).toContain(/ALTER TABLE "(\w+)"/.exec(statement)?.[1]);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/);
  });

  it('`TransportRunLeg` chi duoc THEM mot cot -- khong doi kieu, khong go rang buoc nao', () => {
    const legAlters = migration.match(/ALTER TABLE "TransportRunLeg"[^;]*/g) ?? [];
    expect(legAlters).toHaveLength(2);
    expect(legAlters[0]).toContain('ADD COLUMN "plannedDistanceKm" INTEGER');
    expect(legAlters[1]).toContain('ADD CONSTRAINT');
    for (const statement of legAlters) {
      expect(statement).not.toMatch(/ALTER COLUMN|DROP/);
    }
  });

  it('bang moi chi TRO TOI bang cu, khong bang cu nao tro nguoc vao no', () => {
    for (const target of ['TransportOrder', 'TransportVehicleRun', 'TransportRunLeg']) {
      expect(migration).toContain(`REFERENCES "${target}"("id")`);
    }
    expect(migration).not.toMatch(/ALTER TABLE "TransportOrder" ADD CONSTRAINT \w+_fkey/);
  });

  it('duong lui duoc ghi ra, va no go dung nhung doi tuong da tao', () => {
    for (const name of [
      'transport_run_leg_completed_is_immutable',
      'TransportOrderRunPlan',
      'TransportRunPlanOutcome',
      'TransportRunGrouping',
      'plannedDistanceKm',
    ]) {
      expect(rollback).toContain(name);
    }
  });

  it('duong lui noi ro `distanceKm` KHONG doi nghia', () => {
    expect(rollback).toContain('`distanceKm` van la quang duong DA GHI NHAN');
  });
});
