import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CASHOUT_ALLOCATION_FROZEN_TRIGGER,
  CASHOUT_IMMUTABLE_TRIGGER,
  DRIVER_SETTLEMENT_UNIQUE_INDEXES,
} from './driver-settlement-storage-conflict.js';

/**
 * DOI CHIEU VAN BAN giua migration va cac hang so cua mien.
 *
 * Bai nay khong chay SQL. No ton tai vi mot lop bat bien nam O DUOI Prisma: `CHECK`, unique va
 * trigger deu khong sinh ra tu `schema.prisma`, nen mot lan `migrate diff` vo y se lam chung bien
 * mat MA KHONG mot bai test nao do — cho den khi mot hang sai lot vao DB that.
 *
 * Cung khuon `transport-asset-workforce-storage.spec.ts` cua `TX-06`/`TX-07`.
 */

const migrationsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations',
);
const enumDir = join(migrationsDir, '20260908110000_transport_driver_fund_reimbursement_kind');
const settlementDir = join(migrationsDir, '20260908120000_transport_driver_settlement');

const enumMigration = readFileSync(join(enumDir, 'migration.sql'), 'utf8');
const migration = readFileSync(join(settlementDir, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(settlementDir, 'README-rollback.sql'), 'utf8');

/** CHI CAC CAU LENH — bo moi dong chu thich, cung ly le voi bai cua `TX-06`. */
const statementsOf = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const flat = statementsOf(migration).replace(/\s+/g, ' ');
const enumFlat = statementsOf(enumMigration).replace(/\s+/g, ' ');

const CHECK_CONSTRAINTS = [
  'TransportDriverCashout_businessDate_iso',
  'TransportDriverCashout_method_not_blank',
  'TransportDriverCashout_reversal_shape',
  'TransportDriverCashout_no_self_reversal',
  'TransportDriverCashoutAllocation_money_range',
  'TransportDriverCashoutAllocation_source_shape',
];

describe('migration cua TX-07b', () => {
  it.each(CHECK_CONSTRAINTS)('giu rang buoc %s', (name) => {
    expect(flat).toContain(`ADD CONSTRAINT "${name}"`);
  });

  it.each(DRIVER_SETTLEMENT_UNIQUE_INDEXES.map((ref) => ref.indexName))(
    'giu unique %s',
    (indexName) => {
      expect(flat).toContain(indexName);
    },
  );

  it('giu hai trigger bat bien', () => {
    expect(flat).toContain(`CREATE TRIGGER "${CASHOUT_IMMUTABLE_TRIGGER}"`);
    expect(flat).toContain(`CREATE TRIGGER "${CASHOUT_ALLOCATION_FROZEN_TRIGGER}"`);
  });

  /**
   * Ten trigger phai NAM TRONG cau thong bao, khong chi o ten ham.
   *
   * Prisma khong cho ra ma loi co cau truc cho mot `RAISE EXCEPTION` cua plpgsql, nen
   * `isPostedCashoutMutation()` nhan dien bang van ban. Bo ten khoi cau thong bao se lam ham do
   * lang le tra `false` mai mai.
   */
  it('cau thong bao cua trigger co mang ten trigger', () => {
    expect(flat).toContain(`'${CASHOUT_IMMUTABLE_TRIGGER}:`);
    expect(flat).toContain(`'${CASHOUT_ALLOCATION_FROZEN_TRIGGER}:`);
  });

  it('dong phan bo bi chan CA `UPDATE` lan `DELETE`', () => {
    expect(flat).toContain('BEFORE UPDATE OR DELETE ON "TransportDriverCashoutAllocation"');
  });

  /**
   * Trang thai chi di duoc MOT chieu.
   *
   * Neu dieu kien nay bien mat thi mot `UPDATE` thang vao DB dua mot phieu da dao ve `POSTED`, va
   * bang can doi cua lai xe doi ma khong mot chung tu nao giai thich.
   */
  it('chi cho phep POSTED -> REVERSED', () => {
    expect(flat).toContain(`OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED'`);
  });

  it('so quy nhan them loai but toan hoan ung, va no phai DUONG', () => {
    expect(flat).toContain(`("kind" = 'REIMBURSEMENT' AND "signedAmount" > 0)`);
  });

  /**
   * `ALTER TYPE ... ADD VALUE` phai o MOT TEP RIENG.
   *
   * Postgres cho them gia tri trong mot giao dich tu PG 12, nhung khong cho DUNG gia tri moi trong
   * chinh giao dich do — va Prisma boc moi tep migration trong mot giao dich. Migration cua bang
   * viet lai `..._sign_by_kind`, mot bieu thuc CO NHAC TEN `'REIMBURSEMENT'`. Gop hai viec lam mot
   * tep se cho ra `unsafe use of new value of enum type` khi deploy, khong phai luc test.
   */
  it('gia tri enum moi duoc them o mot migration RIENG, khong dung chung tep voi rang buoc', () => {
    expect(enumFlat).toContain(
      `ALTER TYPE "TransportDriverFundEntryKind" ADD VALUE IF NOT EXISTS 'REIMBURSEMENT'`,
    );
    expect(flat).not.toContain('ADD VALUE');
  });
});

describe('duong lui cua TX-07b', () => {
  it('bo hai bang moi va ba kieu enum moi', () => {
    for (const table of ['TransportDriverCashoutAllocation', 'TransportDriverCashout']) {
      expect(rollback).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    for (const type of [
      'TransportDriverCashoutAllocationSource',
      'TransportDriverCashoutStatus',
      'TransportDriverCashoutKind',
    ]) {
      expect(rollback).toContain(`DROP TYPE IF EXISTS "${type}"`);
    }
  });

  it('thu hep lai rang buoc dau cua so quy — bo `REIMBURSEMENT` khoi bieu thuc', () => {
    expect(rollback).toContain('ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"');
    const constraintBlock = rollback.slice(
      rollback.lastIndexOf('ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"'),
    );
    expect(constraintBlock).not.toContain('REIMBURSEMENT');
  });

  /**
   * Duong lui KHONG duoc `DELETE` mot but toan da ghi.
   *
   * `INV-20` cam xoa, va mot lan chi tien mat da xay ra ngoai doi that. Duong dung la DAO — va
   * `README-rollback.sql` phai noi ro dieu do thay vi de nguoi truc tu nghi ra mot cau `DELETE`.
   */
  it('khong co lenh xoa but toan quy nao', () => {
    expect(rollback).not.toMatch(/DELETE\s+FROM\s+"TransportDriverFundEntry"/i);
    expect(rollback).toContain("'REVERSAL'");
  });
});
