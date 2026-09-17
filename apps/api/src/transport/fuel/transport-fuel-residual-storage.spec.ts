import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUEL_DECISION_SUPERSEDED_ONCE,
  FUEL_ENTRY_STATION_SUPPLIER,
  isStationSupplierViolation,
} from './fuel-storage-conflict.js';

/**
 * `#317` — CAC DOI TUONG DB CUA MIGRATION RESIDUAL KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Cung ly do voi `transport-fuel-storage.spec.ts`: `prisma migrate dev` diff schema voi DB se sinh lenh
 * XOA moi trigger va `CHECK` viet tay. He thong van chay, chi khong con chan gi — va G0 (quyet dinh
 * chi-ghi-them) lan G1 (tram dung nha cung cap) bien mat trong im lang. Tep nay doc CHINH migration va
 * do neu mot ten khong con. Hieu luc THAT cua chung do `transport-fuel-decision-revision.int.spec.ts`
 * va `transport-fuel-station-declaration.int.spec.ts` chung minh tren Postgres.
 *
 * Doc qua `replace(/\r\n/g, '\n')`: worktree Windows la CRLF, blob git la LF
 * (`crlf-worktree-lam-spec-quet-schema-do-gia`).
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260917100000_transport_fuel_residual',
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

describe('#317 G0 — quyet dinh doi soat chi-ghi-them con nguyen trong migration', () => {
  it('trigger tu choi UPDATE/DELETE hang da quyet, va ten nam TRONG thong diep', () => {
    expect(code).toContain(
      'CREATE OR REPLACE FUNCTION "transport_fuel_discrepancy_decision_append_only"()',
    );
    expect(code).toContain('CREATE TRIGGER "transport_fuel_discrepancy_decision_append_only"');
    expect(code).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "TransportFuelDiscrepancy"');
    expect(code).toContain(`IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."status" = 'RESOLVED' THEN`);
    expect(code).toContain("'transport_fuel_discrepancy_decision_append_only: quyet dinh %");
    expect(code).toContain("'transport_fuel_discrepancy_supersession_scope: %");
  });

  it('UNIQUE `supersedesId` + CHECK hinh dang + khoa ngoai NO ACTION', () => {
    expect(code).toContain(`CREATE UNIQUE INDEX "${FUEL_DECISION_SUPERSEDED_ONCE.indexName}"`);
    expect(code).toContain('ADD CONSTRAINT "TransportFuelDiscrepancy_supersession_shape"');
    expect(code).toMatch(
      /"TransportFuelDiscrepancy_supersedesId_fkey" FOREIGN KEY \("supersedesId"\) REFERENCES "TransportFuelDiscrepancy"\("id"\) ON DELETE NO ACTION/,
    );
  });
});

describe('#317 G1 — tram tren phieu thuoc dung nha cung cap', () => {
  it('trigger nghe CA `stationId` lan `supplierId`, ten nam trong thong diep', () => {
    expect(code).toContain('CREATE TRIGGER "transport_fuel_entry_station_supplier"');
    expect(code).toContain(
      'BEFORE INSERT OR UPDATE OF "stationId", "supplierId" ON "TransportFuelEntry"',
    );
    expect(code).toContain(`'${FUEL_ENTRY_STATION_SUPPLIER}: tram %`);
  });

  it('tang kho nhan ra loi trigger bang ten, va khong nhan nham loi khac', () => {
    expect(
      isStationSupplierViolation(
        new Error(`${FUEL_ENTRY_STATION_SUPPLIER}: tram a khong thuoc nha cung cap b cua phieu c`),
      ),
    ).toBe(true);
    expect(isStationSupplierViolation(new Error('mot loi mang binh thuong'))).toBe(false);
    expect(isStationSupplierViolation(null)).toBe(false);
  });
});

describe('#317 — migration chi THEM, chi cham bang Fuel, co duong lui', () => {
  it('khong DROP, khong ALTER COLUMN, khong extension', () => {
    expect(code).not.toMatch(/^\s*DROP\s/m);
    expect(code).not.toMatch(/ALTER COLUMN/);
    expect(code).not.toContain('CREATE EXTENSION');
  });

  /** Chong lot bang cua mien khac (`migrate-diff-keo-theo-do-lech-co-san`). */
  it('moi `ALTER TABLE` / `CREATE INDEX` / `ALTER TYPE` chi nham doi tuong `TransportFuel*`', () => {
    const targets = [
      ...code.matchAll(/ALTER TABLE "([^"]+)"/g),
      ...code.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/g),
      ...code.matchAll(/ALTER TYPE "([^"]+)"/g),
      ...code.matchAll(/ON "([^"]+)"\s+FOR EACH ROW/g),
    ].map((match) => match[1]);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^TransportFuel/);
  });

  it('duong lui go ca hai trigger, `CHECK`, khoa ngoai va hai cot vua them', () => {
    for (const fragment of [
      'DROP TRIGGER IF EXISTS "transport_fuel_entry_station_supplier"',
      'DROP TRIGGER IF EXISTS "transport_fuel_discrepancy_decision_append_only"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_supersession_shape"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_supersedesId_fkey"',
      'DROP COLUMN IF EXISTS "supersedesId"',
      'DROP CONSTRAINT IF EXISTS "TransportFuelEntry_stationId_fkey"',
      'DROP COLUMN IF EXISTS "stationId"',
    ]) {
      expect(rollback).toContain(fragment);
    }
  });
});
