import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUEL_COST_ATTRIBUTION_CORRELATION,
  FUEL_COST_ATTRIBUTION_REVERSED_ONCE,
  FUEL_COST_ATTRIBUTION_TRIGGER,
  FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP,
  FUEL_ENTRY_LEG_RUN,
  FUEL_ENTRY_RUN_VEHICLE,
  isDriverCashNeedsTripViolation,
  isFuelCostAttributionTriggerViolation,
  isLegRunViolation,
  isRunVehicleViolation,
} from './fuel-storage-conflict.js';

/**
 * `#364` — CAC DOI TUONG DB CUA MIGRATION RUN-FIRST KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Cung ly do voi `transport-fuel-residual-storage.spec.ts`: `prisma migrate dev` diff schema voi DB se
 * sinh lenh XOA moi `CHECK` va trigger viet tay. He thong van chay, chi khong con chan gi — va bat bien
 * "khong vuot so tien phieu", "mot phieu mot so cai", "Run-first khong cham Quy lai xe" bien mat
 * trong im lang. Tep nay doc CHINH migration va do neu mot ten khong con. Hieu luc THAT cua chung do
 * `transport-fuel-run-first.int.spec.ts` chung minh tren Postgres.
 *
 * Doc qua `replace(/\r\n/g, '\n')`: worktree Windows la CRLF, blob git la LF.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260922100000_transport_fuel_run_first',
);

const read = (name: string): string =>
  readFileSync(join(MIGRATION_DIR, name), 'utf8').replace(/\r\n/g, '\n');

const migration = read('migration.sql');
const rollback = read('README-rollback.sql');

/** Bo dong chu thich SQL — chu thich cua migration GIAI THICH vi sao khong lam dieu bi cam. */
const code = migration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('#364 — su kien do dau: ngu canh tuy chon, khong phai cha', () => {
  it('`tripId` bo NOT NULL, hai cot ngu canh moi, khoa ngoai RESTRICT', () => {
    expect(code).toContain('ALTER COLUMN "tripId" DROP NOT NULL');
    expect(code).toContain('ADD COLUMN     "runId" TEXT');
    expect(code).toContain('ADD COLUMN     "legId" TEXT');
    expect(code).toMatch(
      /"TransportFuelEntry_runId_fkey" FOREIGN KEY \("runId"\) REFERENCES "TransportVehicleRun"\("id"\) ON DELETE RESTRICT/,
    );
    expect(code).toMatch(
      /"TransportFuelEntry_legId_fkey" FOREIGN KEY \("legId"\) REFERENCES "TransportRunLeg"\("id"\) ON DELETE RESTRICT/,
    );
    // Khoa ngoai toi chuyen v1 KHONG bi dong toi: van `ON DELETE RESTRICT` cua migration goc.
    expect(code).not.toContain('TransportFuelEntry_tripId_fkey');
  });

  it('ba CHECK ngu canh + trigger vong chay/chang, ten nam TRONG thong diep', () => {
    expect(code).toContain('ADD CONSTRAINT "TransportFuelEntry_leg_needs_run"');
    expect(code).toContain('CHECK ("legId" IS NULL OR "runId" IS NOT NULL)');
    expect(code).toContain('ADD CONSTRAINT "TransportFuelEntry_one_context_kind"');
    expect(code).toContain('CHECK (num_nonnulls("tripId", "runId") <= 1)');
    expect(code).toContain(`ADD CONSTRAINT "${FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP}"`);
    expect(code).toContain(`CHECK ("paymentMethod" <> 'DRIVER_CASH' OR "tripId" IS NOT NULL)`);

    expect(code).toContain('CREATE TRIGGER "transport_fuel_entry_run_context"');
    expect(code).toContain(
      'BEFORE INSERT OR UPDATE OF "runId", "legId", "vehicleId" ON "TransportFuelEntry"',
    );
    expect(code).toContain(`'${FUEL_ENTRY_RUN_VEHICLE}: vong chay %`);
    expect(code).toContain(`'${FUEL_ENTRY_LEG_RUN}: chang %`);
  });

  it('KHONG backfill, KHONG viet lai hang cu', () => {
    expect(code).not.toMatch(/^\s*UPDATE\s/m);
    expect(code).not.toMatch(/^\s*INSERT\s/m);
    expect(code).not.toMatch(/^\s*DELETE\s/m);
  });
});

describe('#364 — phan bo gia thanh: lop rieng, chi ghi them, khong vuot so tien', () => {
  it('bang moi + hai unique (khoa chong ghi trung, mot cap phat dao mot lan)', () => {
    expect(code).toContain('CREATE TABLE "TransportFuelCostAttribution"');
    expect(code).toContain(
      `CREATE UNIQUE INDEX "${FUEL_COST_ATTRIBUTION_CORRELATION.indexName}" ON "TransportFuelCostAttribution"("correlationKey")`,
    );
    expect(code).toContain(
      `CREATE UNIQUE INDEX "${FUEL_COST_ATTRIBUTION_REVERSED_ONCE.indexName}" ON "TransportFuelCostAttribution"("reversalOfId")`,
    );
  });

  it('CHECK hinh dang dich, hinh dang dong va khoang tien', () => {
    expect(code).toContain('ADD CONSTRAINT "TransportFuelCostAttribution_target_shape"');
    expect(code).toContain('ADD CONSTRAINT "TransportFuelCostAttribution_kind_shape"');
    expect(code).toContain(
      `("kind" = 'ALLOCATION' AND "signedAmount" > 0 AND "reversalOfId" IS NULL)`,
    );
    expect(code).toContain('ADD CONSTRAINT "TransportFuelCostAttribution_amount_money_range"');
  });

  it('trigger gac KHOA hang phieu roi moi cong, va mang du bay ly do co ten', () => {
    expect(code).toContain('CREATE TRIGGER "transport_fuel_cost_attribution_guard"');
    expect(code).toContain('BEFORE INSERT ON "TransportFuelCostAttribution"');
    // Khoa hang phieu PHAI di truoc phep cong — do la ca noi dung cua "khong the cung vuot".
    const lockAt = code.indexOf(
      'FROM "TransportFuelEntry"\n  WHERE "id" = NEW."fuelEntryId"\n  FOR UPDATE;',
    );
    const sumAt = code.indexOf('SELECT COALESCE(SUM("signedAmount"), 0) INTO attributed');
    expect(lockAt).toBeGreaterThan(0);
    expect(sumAt).toBeGreaterThan(lockAt);

    for (const name of [
      FUEL_COST_ATTRIBUTION_TRIGGER.exceedsEntry,
      FUEL_COST_ATTRIBUTION_TRIGGER.legacyTrip,
      FUEL_COST_ATTRIBUTION_TRIGGER.notVerified,
      FUEL_COST_ATTRIBUTION_TRIGGER.targetVehicle,
      FUEL_COST_ATTRIBUTION_TRIGGER.legRun,
      FUEL_COST_ATTRIBUTION_TRIGGER.reversalShape,
    ]) {
      expect(code, name).toContain(`'${name}: `);
    }
  });

  it('trigger chi-ghi-them chan CA `UPDATE` lan `DELETE`', () => {
    expect(code).toContain('CREATE TRIGGER "transport_fuel_cost_attribution_append_only"');
    expect(code).toContain('BEFORE UPDATE OR DELETE ON "TransportFuelCostAttribution"');
    expect(code).toContain(`'${FUEL_COST_ATTRIBUTION_TRIGGER.appendOnly}: dong phan bo %`);
  });
});

describe('#364 — migration chi cham doi tuong Fuel, co duong lui', () => {
  /** Chong lot bang cua mien khac — `prisma migrate diff` keo theo do lech co san cua `main`. */
  it('moi `ALTER TABLE` / `CREATE INDEX` / `CREATE TABLE` / trigger chi nham `TransportFuel*`', () => {
    const targets = [
      ...code.matchAll(/ALTER TABLE "([^"]+)"/g),
      ...code.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/g),
      ...code.matchAll(/CREATE TABLE "([^"]+)"/g),
      ...code.matchAll(/ON "([^"]+)"\s+FOR EACH ROW/g),
    ].map((match) => match[1]);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^TransportFuel/);
  });

  it('khong DROP, khong doi kieu cot, khong extension', () => {
    expect(code).not.toMatch(/^\s*DROP\s/m);
    expect(code).not.toMatch(/ALTER COLUMN "[^"]+" (?:SET DATA )?TYPE/);
    expect(code).not.toContain('CREATE EXTENSION');
  });

  it('duong lui go moi doi tuong, va CHET chu khong xoa khi con phieu Run-first', () => {
    for (const fragment of [
      'DROP TRIGGER IF EXISTS "transport_fuel_cost_attribution_append_only"',
      'DROP TRIGGER IF EXISTS "transport_fuel_cost_attribution_guard"',
      'DROP TABLE IF EXISTS "TransportFuelCostAttribution"',
      'DROP TRIGGER IF EXISTS "transport_fuel_entry_run_context"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelEntry_driver_cash_needs_trip"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelEntry_one_context_kind"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelEntry_leg_needs_run"',
      'DROP COLUMN IF EXISTS "legId"',
      'DROP COLUMN IF EXISTS "runId"',
      'ALTER COLUMN "tripId" SET NOT NULL',
    ]) {
      expect(rollback).toContain(fragment);
    }
    // Duong lui KHONG duoc xoa su kien do dau that de ep `SET NOT NULL` qua.
    const rollbackCode = rollback
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(rollbackCode).not.toMatch(/DELETE FROM "TransportFuelEntry"/);
  });
});

describe('#364 — tang kho nhan ra loi CSDL bang ten, va khong nhan nham loi khac', () => {
  it.each([
    [isRunVehicleViolation, `${FUEL_ENTRY_RUN_VEHICLE}: vong chay a khong phai cua xe b`],
    [isLegRunViolation, `${FUEL_ENTRY_LEG_RUN}: chang a khong thuoc vong chay b`],
    [
      isDriverCashNeedsTripViolation,
      `new row violates check constraint "${FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP}"`,
    ],
  ])('%o', (detector, message) => {
    expect(detector(new Error(message))).toBe(true);
    expect(detector(new Error('mot loi mang binh thuong'))).toBe(false);
    expect(detector(null)).toBe(false);
  });

  it('bay ten trigger phan bo — moi ten mot bo nhan dien rieng', () => {
    for (const key of Object.keys(FUEL_COST_ATTRIBUTION_TRIGGER) as Array<
      keyof typeof FUEL_COST_ATTRIBUTION_TRIGGER
    >) {
      const error = new Error(`${FUEL_COST_ATTRIBUTION_TRIGGER[key]}: chi tiet`);
      expect(isFuelCostAttributionTriggerViolation(error, key), key).toBe(true);
    }
    expect(isFuelCostAttributionTriggerViolation(new Error('mot loi khac'), 'exceedsEntry')).toBe(
      false,
    );
  });
});
