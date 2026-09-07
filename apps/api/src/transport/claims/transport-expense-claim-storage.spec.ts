import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLAIM_RESERVED_CATEGORY_CODES } from './claim.types.js';

/**
 * TANG LUU TRU cua de nghi chi (R1-C).
 *
 * Doc chinh tep migration nhu VAN BAN, khong cham co so du lieu. Ly do da ghi o khoi canh bao dau
 * muc Transport trong `schema.prisma`.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260907210000_transport_expense_claim',
);
const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

describe('tang luu tru cua de nghi chi (R1-C)', () => {
  it.each([
    'TransportExpenseClaim_claimed_amount_range',
    'TransportExpenseClaim_approved_amount_bounded',
    'TransportExpenseClaim_approved_amount_matches_status',
    'TransportExpenseClaim_settlement_only_when_approved',
    'TransportExpenseClaim_reference_required',
    'TransportExpenseClaim_category_not_reserved',
    'TransportExpenseClaimDecision_sequence_positive',
    'TransportExpenseClaimDecision_amount_matches_outcome',
    'TransportExpenseClaimDecision_amount_range',
  ])('migration van khai `%s`', (name) => {
    expect(migration).toContain(name);
  });

  it('CHI khoan DA DUYET moi gan duoc vao mot dong gia thanh', () => {
    expect(migration).toContain(`CHECK ("settlementExpenseId" IS NULL OR "status" = 'APPROVED')`);
  });

  it('so duyet khong bao gio vuot so de nghi -- va rang buoc la `<=`, khong phai `=`', () => {
    expect(migration).toContain('"approvedAmount" <= "claimedAmount"');
    // `=` se khoa cung duyet TRON KHOAN vao kieu du lieu, va `Q-04` se phai doi schema de mo.
    expect(migration).not.toContain('"approvedAmount" = "claimedAmount"');
  });

  it('mot de nghi sinh NHIEU NHAT mot khoan chi', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TransportExpenseClaim_settlementExpenseId_key"',
    );
  });

  it('lich su quyet dinh khong co hai hang cung so thu tu', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TransportExpenseClaimDecision_claimId_sequence_key"',
    );
  });

  it('nhien lieu va ETC bi chan O DB, dung nhung ma tang mien dung', () => {
    for (const code of CLAIM_RESERVED_CATEGORY_CODES) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain('upper(btrim("categoryCode")) NOT IN');
  });

  it('CHI THEM: khong `ALTER TABLE` mot bang cu nao, khong `DROP` gi', () => {
    const created = ['TransportExpenseClaim', 'TransportExpenseClaimDecision'];
    const alters = migration.match(/ALTER TABLE "(\w+)"/g) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const statement of alters) {
      const table = /ALTER TABLE "(\w+)"/.exec(statement)?.[1];
      expect(created).toContain(table);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/);
  });

  it('so cai T3 khong bi cham -- chi duoc TRO TOI bang khoa ngoai', () => {
    expect(migration).toContain('REFERENCES "TransportTripExpense"("id")');
    expect(migration).not.toMatch(/ALTER TABLE "TransportTripExpense"/);
    expect(migration).not.toMatch(/ALTER TABLE "TransportDriverFundEntry"/);
  });

  it('duong lui noi ro cai gi mat va cai gi khong', () => {
    for (const name of [
      'TransportExpenseClaimDecision',
      'TransportExpenseClaim',
      'TransportExpenseClaimDecisionOutcome',
      'TransportExpenseClaimStatus',
    ]) {
      expect(rollback).toContain(name);
    }
    // Tien khong mat, nhung co so giai trinh cua tien thi mat -- duong lui phai noi ra dieu do.
    expect(rollback).toContain('KHONG bi migration nay dung toi');
  });
});
