import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FUEL_DISCREPANCY_KINDS } from './fuel-matching.js';
import {
  FUEL_ENTRY_MATCHED_STAYS_PAYABLE,
  FUEL_MATCH_PAYABLE_ENTRY_ONLY,
  isCashPaidMatchViolation,
  isMatchedEntryPaymentChangeViolation,
  isSelfSourcedMatchViolation,
} from './fuel-storage-conflict.js';

/**
 * `#371` — CAC DOI TUONG DB cua "cong no chi den tu phieu ghi no" KHONG bieu dien duoc bang
 * `schema.prisma`.
 *
 * Cung ly do voi `transport-fuel-run-first-driver-cash-storage.spec.ts`: `prisma migrate dev` diff
 * schema voi DB se sinh lenh XOA moi trigger viet tay — he thong van chay, chi khong con chan gi, va
 * duong tra hai lan mo lai trong im lang. Tep nay doc CHINH hai migration va do neu mot ten khong con.
 * Hieu luc THAT do `transport-fuel-payment-method-conflict.int.spec.ts` chung minh tren Postgres.
 *
 * Doc qua `replace(/\r\n/g, '\n')`: worktree Windows co the la CRLF, blob git la LF.
 */

const API = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATIONS = join(API, 'prisma/migrations');

const read = (dir: string, name: string): string =>
  readFileSync(join(MIGRATIONS, dir, name), 'utf8').replace(/\r\n/g, '\n');

/** Bo dong chu thich SQL — chu thich GIAI THICH vi sao, khong duoc tinh la lenh. */
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const kindMigration = stripComments(
  read('20260923120000_transport_fuel_discrepancy_payment_method_conflict_kind', 'migration.sql'),
);
const code = stripComments(
  read('20260923120100_transport_fuel_match_payable_entry_only', 'migration.sql'),
);
const rollback = read(
  '20260923120100_transport_fuel_match_payable_entry_only',
  'README-rollback.sql',
);
const rollbackCode = stripComments(rollback);
const schema = readFileSync(join(API, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n');

describe('#371 — gia tri enum tach RIENG mot migration', () => {
  it('chi MOT cau lenh, co `IF NOT EXISTS`', () => {
    const statements = kindMigration
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    expect(statements).toEqual([
      `ALTER TYPE "TransportFuelDiscrepancyKind" ADD VALUE IF NOT EXISTS 'PAYMENT_METHOD_CONFLICT'`,
    ]);
  });

  /** Ba ban cua cung mot tu vung — enum DB, enum Prisma, hang so mien — khong duoc lech nhau. */
  it('enum Prisma va tu vung mien deu co `PAYMENT_METHOD_CONFLICT`', () => {
    const block = schema.slice(
      schema.indexOf('enum TransportFuelDiscrepancyKind {'),
      schema.indexOf('}', schema.indexOf('enum TransportFuelDiscrepancyKind {')),
    );
    expect(block).toMatch(/^\s+PAYMENT_METHOD_CONFLICT$/m);
    expect(FUEL_DISCREPANCY_KINDS).toContain('PAYMENT_METHOD_CONFLICT');
  });
});

describe('#371 — hai trigger giu "cap khop chi toi phieu ghi no" o tang CSDL', () => {
  it('chieu cap khop: BEFORE INSERT OR UPDATE, kiem DUONG `SUPPLIER_ACCOUNT`, ten trong thong diep', () => {
    expect(code).toContain(`CREATE TRIGGER "${FUEL_MATCH_PAYABLE_ENTRY_ONLY}"`);
    expect(code).toContain('BEFORE INSERT OR UPDATE ON "TransportFuelMatch"');
    expect(code).toContain(`IF FOUND AND entry_payment_method <> 'SUPPLIER_ACCOUNT' THEN`);
    expect(code).toContain(`'${FUEL_MATCH_PAYABLE_ENTRY_ONLY}: phieu %`);
    expect(code).toContain(`USING ERRCODE = 'integrity_constraint_violation'`);
  });

  /**
   * Thieu chieu nay, trigger tren chi chan luc GHI CAP KHOP: mot `UPDATE` cach tra sau do tao lai dung
   * hinh dang tra hai lan ma khong cham bang cap khop nao.
   */
  it('chieu phieu: BEFORE UPDATE OF "paymentMethod", phieu dang co cap khop khong roi SUPPLIER_ACCOUNT', () => {
    expect(code).toContain(`CREATE TRIGGER "${FUEL_ENTRY_MATCHED_STAYS_PAYABLE}"`);
    expect(code).toContain('BEFORE UPDATE OF "paymentMethod" ON "TransportFuelEntry"');
    expect(code).toContain(`IF NEW."paymentMethod" <> 'SUPPLIER_ACCOUNT'`);
    expect(code).toContain(
      'EXISTS (SELECT 1 FROM "TransportFuelMatch" WHERE "fuelEntryId" = NEW."id")',
    );
    expect(code).toContain(`'${FUEL_ENTRY_MATCHED_STAYS_PAYABLE}: phieu %`);
  });

  /** Migration chi THEM: khong mot lenh nao dong vao hang hay cot da co. */
  it('chi them — khong DROP, khong DELETE, khong UPDATE du lieu, khong doi cot', () => {
    for (const forbidden of [
      /\bDROP\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bUPDATE\s+"/i,
      /ALTER\s+TABLE/i,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('nhan dien dung hai trigger, khong nham voi `INV-26` hay mot loi thuong', () => {
    const cashPaid = new Error(`${FUEL_MATCH_PAYABLE_ENTRY_ONLY}: phieu fu-1 tra bang DRIVER_CASH`);
    const entrySide = new Error(`${FUEL_ENTRY_MATCHED_STAYS_PAYABLE}: phieu fu-1 dang co cap khop`);
    expect(isCashPaidMatchViolation(cashPaid)).toBe(true);
    expect(isMatchedEntryPaymentChangeViolation(entrySide)).toBe(true);
    expect(isCashPaidMatchViolation(entrySide)).toBe(false);
    expect(isSelfSourcedMatchViolation(cashPaid)).toBe(false);
    expect(isCashPaidMatchViolation(new Error('mot loi mang binh thuong'))).toBe(false);
  });
});

describe('#371 — duong lui', () => {
  it('go CA HAI trigger + ham, xoa hai dong `_prisma_migrations`, trong mot giao dich', () => {
    expect(rollbackCode).toMatch(/^BEGIN;/m);
    expect(rollbackCode).toMatch(/^COMMIT;/m);
    expect(rollbackCode).toContain(
      `DROP TRIGGER IF EXISTS "${FUEL_ENTRY_MATCHED_STAYS_PAYABLE}" ON "TransportFuelEntry"`,
    );
    expect(rollbackCode).toContain(
      `DROP TRIGGER IF EXISTS "${FUEL_MATCH_PAYABLE_ENTRY_ONLY}" ON "TransportFuelMatch"`,
    );
    expect(rollbackCode).toContain(
      'DROP FUNCTION IF EXISTS transport_fuel_match_payable_entry_only()',
    );
    expect(rollbackCode).toContain(
      'DROP FUNCTION IF EXISTS transport_fuel_entry_matched_stays_payable()',
    );
    expect(rollbackCode).toContain(`'20260923120100_transport_fuel_match_payable_entry_only'`);
    expect(rollbackCode).toContain(
      `'20260923120000_transport_fuel_discrepancy_payment_method_conflict_kind'`,
    );
  });

  /** Gia tri enum khong bo duoc — va tai lieu phai noi ro KHI NAO dung lai, khong xoa lich su. */
  it('noi ro gia tri enum thua lai va dem hang PAYMENT_METHOD_CONFLICT truoc khi lui', () => {
    expect(rollback).toContain(`WHERE "kind" = 'PAYMENT_METHOD_CONFLICT'`);
    expect(rollback).toContain('DROP VALUE');
    expect(rollbackCode).not.toMatch(/DELETE FROM "TransportFuelDiscrepancy"/);
  });
});
