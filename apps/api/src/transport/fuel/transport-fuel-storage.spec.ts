import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUEL_MATCH_NO_SELF_SOURCE,
  FUEL_UNIQUE_INDEXES,
  isSelfSourcedMatchViolation,
} from './fuel-storage-conflict.js';

/**
 * CAC DOI TUONG DB CUA T4 KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Chung song trong SQL tho cua migration, va `prisma migrate dev` — von sinh migration bang cach
 * diff schema voi DB — se sinh lenh XOA tat ca. He thong van chay binh thuong sau do, chi khong con
 * chan gi ca: dau tien, vong doi duyet, `INV-06` o tang DB va `INV-26` deu bien mat trong im lang.
 *
 * Bo test nay doc CHINH tep migration va do neu mot ten khong con. No khong the hien constraint co
 * hieu luc hay khong — do la viec cua `transport-fuel.int.spec.ts` tren Postgres THAT. Cai no chan
 * la mot lan "don dep" xoa mat chung ma khong ai nhan ra.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260831120000_transport_fuel',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

/** Moi `CHECK` cua T4, kem cau mot dong ve dieu no giu. */
const CHECK_CONSTRAINTS: ReadonlyArray<readonly [string, string]> = [
  ['TransportFuelEntry_amount_money_range', 'tien phieu duong va trong khoang bieu dien duoc'],
  ['TransportFuelEntry_liters_positive', 'so lit > 0'],
  ['TransportFuelEntry_odometer_non_negative', 'odo khong am'],
  ['TransportFuelEntry_consumption_needs_odo', 'INV-06 — co tieu hao thi phai co mau so duong'],
  ['TransportFuelEntry_businessDate_iso', 'ngay nghiep vu dang YYYY-MM-DD (INV-25)'],
  ['TransportFuelEntry_review_lifecycle', 'trang thai duyet di cung dau vet duyet'],
  ['TransportFuelStatementLine_amount_money_range', 'tien dong bang ke trong khoang'],
  ['TransportFuelStatementLine_liters_positive', 'so lit dong bang ke > 0'],
  ['TransportFuelStatementLine_businessDate_iso', 'ngay dong bang ke dang YYYY-MM-DD'],
  ['TransportFuelStatementLine_accepted_fields', 'dong ACCEPTED phai du bon truong so khop'],
  ['TransportFuelStatementLine_rejected_reason', 'dong REJECTED phai co ly do co ten'],
  ['TransportFuelSupplierStatement_period_order', 'ngay dau ky <= ngay cuoi ky'],
  ['TransportFuelReconciliation_period_order', 'nhu tren, cho ky doi soat'],
  ['TransportFuelSettlementHandoff_period_order', 'nhu tren, cho ban giao T5'],
  ['TransportFuelSettlementHandoff_amount_money_range', 'tong ban giao >= 0 va trong khoang'],
  ['TransportFuelDiscrepancy_resolved_fields', 'da quyet thi phai co nguoi quyet va luc quyet'],
  ['TransportFuelDiscrepancy_has_subject', 'chenh lech phai gan vao it nhat mot ve'],
];

describe('Rang buoc T4 phai con nguyen trong migration', () => {
  it.each(CHECK_CONSTRAINTS)('%s — %s', (name) => {
    expect(migration).toContain(`ADD CONSTRAINT "${name}"`);
  });

  it('dem du so `CHECK` — them mot cai moi ma quen bo test nay se do o day', () => {
    const declared = migration.match(/ADD CONSTRAINT "TransportFuel[^"]+"\s+CHECK/g) ?? [];
    expect(declared).toHaveLength(CHECK_CONSTRAINTS.length);
  });

  it.each(FUEL_UNIQUE_INDEXES.map((index) => [index.indexName] as const))(
    'unique %s duoc tao',
    (indexName) => {
      expect(migration).toContain(`CREATE UNIQUE INDEX "${indexName}"`);
    },
  );
});

/**
 * `INV-26` — bat bien duy nhat cua T4 khong bieu dien duoc bang mot `CHECK`.
 *
 * No so hai cot o HAI BANG khac nhau, ma `CHECK` cua PostgreSQL chi doc duoc hang cua chinh no.
 * Nen no la mot TRIGGER — va vi mot trigger khong mang ma loi co cau truc nao, tang kho phai nhan
 * dien no bang chinh TEN trong thong diep. Bo test nay khoa soi day do lai.
 */
describe('INV-26 — trigger, va soi day noi no voi tang kho', () => {
  it('ham va trigger deu duoc tao trong migration', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION transport_fuel_match_no_self_source()');
    expect(migration).toContain(`CREATE TRIGGER "${FUEL_MATCH_NO_SELF_SOURCE}"`);
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON "TransportFuelMatch"');
  });

  /**
   * Ten rang buoc phai nam TRONG THONG DIEP cua `RAISE EXCEPTION`, khong chi o ten trigger.
   *
   * Postgres khong tu them ten trigger vao thong diep loi, nen neu ai do sua cau thong bao ma bo
   * ten di, `isSelfSourcedMatchViolation()` se khong nhan ra nua — va mot lan `INV-26` bi chan se
   * di ra ngoai duoi dang loi 500 thay vi mot ma nghiep vu.
   */
  it('ten rang buoc duoc nhung vao chinh thong diep RAISE EXCEPTION', () => {
    expect(migration).toContain(`'${FUEL_MATCH_NO_SELF_SOURCE}: phieu %`);
  });

  it('tang kho nhan ra loi do bang ten, va khong nhan nham loi khac', () => {
    expect(
      isSelfSourcedMatchViolation(
        new Error(`${FUEL_MATCH_NO_SELF_SOURCE}: phieu abc duoc de ra tu chinh bang ke xyz`),
      ),
    ).toBe(true);
    expect(isSelfSourcedMatchViolation(new Error('mot loi mang binh thuong'))).toBe(false);
    expect(isSelfSourcedMatchViolation(null)).toBe(false);
  });
});

describe('Migration T4 chi THEM, va co duong lui doc duoc', () => {
  /**
   * Mot dong `DROP`/`ALTER COLUMN` trong migration nay se cham vao du lieu dang chay cua T2/T3.
   *
   * Moi bang va moi kieu cua T4 deu moi tinh, nen khong co lenh nao nhu vay la dieu KIEM DUOC.
   * Bai test doc chinh tep de mot lan sua sau nay khong lang le bien no thanh mot migration co pha
   * huy.
   */
  it('khong co lenh DROP hay ALTER COLUMN nao', () => {
    expect(migration).not.toMatch(/^\s*DROP\s/m);
    expect(migration).not.toMatch(/ALTER COLUMN/);
  });

  it('khong doi hoi extension moi — khac T3 (`btree_gist`)', () => {
    expect(migration).not.toContain('CREATE EXTENSION');
  });

  it('duong lui go duoc moi rang buoc va trigger vua tao', () => {
    for (const [name] of CHECK_CONSTRAINTS) {
      expect(rollback).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    expect(rollback).toContain(`DROP TRIGGER IF EXISTS "${FUEL_MATCH_NO_SELF_SOURCE}"`);
    expect(rollback).toContain('DROP FUNCTION IF EXISTS transport_fuel_match_no_self_source()');
  });

  /**
   * BUOC XOA BANG phai o dang COMMENT.
   *
   * Duong lui cua T4 xoa THAM CHIEU TOI ANH CHUNG TU — anh van con trong kho, nhung khong con gi
   * biet no thuoc phieu nao. De mot lenh xoa bang chay duoc khi dan ca tep vao `psql` la dat bang
   * chung cua ca mot ky doi soat sau mot lan dan chuot.
   */
  it('lenh xoa bang nam o dang comment, khong chay duoc khi dan ca tep', () => {
    for (const table of [
      'TransportFuelEntry',
      'TransportFuelStatementLine',
      'TransportFuelSettlementHandoff',
    ]) {
      expect(rollback).toContain(`-- DROP TABLE IF EXISTS "${table}";`);
      expect(rollback).not.toMatch(new RegExp(`^\\s*DROP TABLE IF EXISTS "${table}"`, 'm'));
    }
  });
});
