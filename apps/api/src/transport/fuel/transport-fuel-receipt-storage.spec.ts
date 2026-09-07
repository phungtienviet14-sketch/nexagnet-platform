import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LAN DI DB CUA C3 — mot cot, mot rang buoc, va bon gia tri enum khong lui duoc.
 *
 * Cung ly le voi hai bo storage spec truoc: `prisma migrate dev` sinh migration bang cach diff
 * schema voi DB, va no SE sinh lenh xoa `CHECK` duoi day. He thong van chay sau do — chi khong
 * con chan gi ca.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = resolve(
  HERE,
  '../../../prisma/migrations/20260909100000_transport_fuel_receipt_image',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');
const schema = readFileSync(resolve(HERE, '../../../prisma/schema.prisma'), 'utf8');

describe('C3 §4 — lan di DB cua duong anh', () => {
  it('RCP-01 them cot `confidence` dang JSONB, khong phai mot con so', () => {
    expect(migration).toContain(
      'ALTER TABLE "TransportFuelCandidate" ADD COLUMN "confidence" JSONB',
    );
  });

  /**
   * Rang buoc nay chan dung kieu hong de xay ra nhat: mot ngay nao do co nguoi "don gian hoa" bang
   * cach ghi mot con so trung binh vao day. Luc do phat hien "o nao mo" cua C4 mat sach thong tin
   * ve O NAO — va mat trong im lang, vi mot con so van doc ra duoc.
   */
  it('RCP-02 rang buoc ep `confidence` la mot BANG, khong phai mot vo huong', () => {
    expect(migration).toContain('TransportFuelCandidate_confidence_is_object');
    expect(migration).toContain(`jsonb_typeof("confidence") = 'object'`);
  });

  it('RCP-03 cot cho phep NULL — `NULL` la "khong ap dung", khong phai "chua do duoc"', () => {
    // Khong `SET NOT NULL` o dau, va khong mot gia tri mac dinh nao: mot ung vien tu hoa don da ky
    // phai o lai dang `NULL`, chu khong duoc gan mot muc tin gia bang `CONFIDENCE_SCALE`.
    expect(migration).not.toContain('SET NOT NULL');
    expect(migration).not.toMatch(/ADD COLUMN "confidence"[^;]*DEFAULT/);
  });

  it('RCP-04 them `RECEIPT_IMAGE` va ba ma tu choi cua duong anh', () => {
    for (const value of [
      'RECEIPT_IMAGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'EXTRACTION_UNAVAILABLE',
      'EXTRACTION_MALFORMED_OUTPUT',
    ]) {
      expect(migration).toContain(`ADD VALUE IF NOT EXISTS '${value}'`);
    }
  });

  it('RCP-05 lan di nay KHONG dung gia tri enum vua them o cau lenh nao ben duoi', () => {
    // Postgres cam dung mot gia tri enum vua them trong cung mot giao dich. Lan di se hong o DUNG
    // moi truong that neu co ai them mot cau `UPDATE ... = 'RECEIPT_IMAGE'` vao day.
    const afterEnum = migration.slice(migration.lastIndexOf('ADD VALUE IF NOT EXISTS'));
    expect(afterEnum).not.toMatch(/UPDATE|INSERT/);
  });

  it('RCP-06 `schema.prisma` va migration noi cung mot chuyen', () => {
    expect(schema).toContain('RECEIPT_IMAGE');
    expect(schema).toContain('confidence Json?');
  });

  /**
   * Duong lui phai TRUNG THUC ve cai no khong lam duoc.
   *
   * Postgres khong co `ALTER TYPE ... DROP VALUE`. Mot tep lui im lang ve dieu do se de nguoi truc
   * tin rang minh da tra he thong ve nguyen trang — roi ngac nhien khi mot gia tri enum van con.
   */
  it('RCP-07 duong lui bo cot + rang buoc, va NOI RO rang gia tri enum o lai', () => {
    expect(rollback).toContain(
      'DROP CONSTRAINT IF EXISTS "TransportFuelCandidate_confidence_is_object"',
    );
    expect(rollback).toContain('DROP COLUMN IF EXISTS "confidence"');
    expect(rollback).toContain('ALTER TYPE ... DROP VALUE');
    expect(rollback).not.toMatch(/^\s*ALTER TYPE .* DROP VALUE/m);
  });

  it('RCP-08 duong lui bao DEM cai sap mat truoc khi chay', () => {
    expect(rollback).toContain('WHERE "confidence" IS NOT NULL');
  });
});
