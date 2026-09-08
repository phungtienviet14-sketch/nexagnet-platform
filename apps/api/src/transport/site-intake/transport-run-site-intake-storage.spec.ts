import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua TX-10 (`#267` H3/H4/H7) — nhung thu `schema.prisma` khong noi duoc.
 *
 * Ba `CHECK` va mot `TRIGGER` song trong SQL tho. `prisma migrate dev` sinh migration bang cach
 * diff schema voi DB, nen no se sinh lenh xoa ca bon. He thong van chay binh thuong sau do, chi
 * khong con chan gi — va thu bi mat la chinh cai bang chung ma `#267` doi phai co: rang lan tao
 * NAY da co mot con nguoi bam vao no, va chi mot lan.
 */

const MIGRATION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260909230200_transport_run_site_intake',
);
const migration = readFileSync(join(MIGRATION, 'migration.sql'), 'utf8');

describe('tang luu tru cua nhan viec tai dia diem A (TX-10)', () => {
  it.each([
    'TransportRunSiteIntake_businessDate_iso',
    'TransportRunSiteIntake_clientEventId_shape',
    'TransportRunSiteIntake_trust_shape',
  ])('migration van khai `%s`', (name) => {
    expect(migration).toContain(name);
  });

  /**
   * RANG BUOC QUAN TRONG NHAT CUA CA BANG. `#267` H3: *"Prove retry/idempotency so double tap/
   * offline replay cannot create two Runs"*.
   *
   * Khoa phai chan lan ghi THU HAI *truoc khi* co vong chay thu hai, nen no khong the chua `runId`
   * — thu chi hinh thanh SAU cai ma no dang tim cach chan. Bai nay khoa ca hai cot.
   */
  it('khoa chong lap la `(driverId, clientEventId)`, khong dinh toi `runId`', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "TransportRunSiteIntake_driver_event_key"');
    expect(migration).toContain('("driverId", "clientEventId")');
  });

  it('mot vong chay, mot chang va mot ban dinh vi deu chi nhan MOT lan nhan viec', () => {
    for (const column of ['runId', 'legId', 'observationId']) {
      expect(migration).toContain(`CREATE UNIQUE INDEX "TransportRunSiteIntake_${column}_key"`);
    }
  });

  /**
   * GHI THEM, KHONG GHI DE, KHONG XOA. Neu hang nay sua duoc thi cau tra loi cho *"co ai bam
   * khong, hay may tu tao"* cung sua duoc — va luc do ca bang khong con chung minh dieu gi.
   */
  it('trigger chan moi lan sua va moi lan xoa', () => {
    expect(migration).toContain('CREATE TRIGGER "transport_run_site_intake_append_only"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "TransportRunSiteIntake"');
  });

  /** Mot lan nhan viec la bang chung; khong hang nao no tro toi duoc phep bien mat duoi chan no. */
  it('ca nam khoa ngoai deu RESTRICT', () => {
    const fkeys = [...migration.matchAll(/ADD CONSTRAINT "TransportRunSiteIntake_\w+_fkey"/g)];
    expect(fkeys).toHaveLength(5);
    expect(migration).not.toContain('ON DELETE CASCADE');
    expect(migration).not.toContain('ON DELETE SET NULL');
  });

  /**
   * MIGRATION NAY KHONG DUOC SUA MOT BANG NAO DA CO. `#266` cam dong vao du lieu khach dang chay,
   * va `#267` §Ownership cam sua mo hinh cua lane khac.
   */
  it('khong sua/xoa mot cot hay bang nao dang ton tai', () => {
    const alters = [...migration.matchAll(/ALTER TABLE "([A-Za-z]+)"/g)].map((match) => match[1]);
    expect(new Set(alters)).toEqual(new Set(['TransportRunSiteIntake']));
    expect(migration).not.toMatch(/ALTER COLUMN/i);
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });

  /**
   * KHONG MOT TRUONG TIEN NAO. `#267` H4: *"no freight/revenue/payment term/commission/settlement
   * data may be fabricated"*.
   *
   * Bai nay quet chinh danh sach cot, nen mot cot tien them vao bang se lam no do — ke ca khi
   * khong ai sua bai nay.
   */
  it('bang khong mang mot cot tien nao', () => {
    const columns = migration.slice(
      migration.indexOf('CREATE TABLE'),
      migration.indexOf('CREATE UNIQUE INDEX'),
    );
    for (const money of ['amount', 'price', 'currency', 'freight', 'fee', 'cost', 'rate']) {
      expect(columns.toLowerCase()).not.toContain(money);
    }
  });

  /**
   * `SERVER_BOUND` ma khong co ban dinh vi la mot lan noi doi ve suc nang cua bang chung. Chieu
   * nguoc lai KHONG bi cam, va bai nay khoa ca chieu do — mot `CHECK` doi hai chieu se cam mot lan
   * `DRIVER_REPORTED` mang kem ban dinh vi, tuc cam mot su that.
   */
  it('rang buoc tin cay chi rang buoc MOT chieu', () => {
    expect(migration).toContain(
      `CHECK ("locationTrust" <> 'SERVER_BOUND' OR "observationId" IS NOT NULL)`,
    );
  });
});
