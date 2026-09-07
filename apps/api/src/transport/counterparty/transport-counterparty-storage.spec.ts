import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * BA DOI TUONG DB CUA R1-A KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Hai `CHECK` va mot khoa chinh KEP song trong SQL tho cua migration. `prisma migrate dev` — von
 * sinh migration bang cach diff schema voi DB — se sinh lenh xoa hai `CHECK` do. He thong van chay
 * binh thuong sau do, chi khong con chan gi: mot phap nhan ten rong va mot ma so thue rac se ghi
 * duoc, va cot `taxCode` UNIQUE se bi mot chuoi rac CHIEM CHO danh tinh cua doanh nghiep that.
 *
 * Bo test nay doc CHINH tep migration va do neu mot ten khong con. No khong the hien constraint co
 * hieu luc hay khong — do la viec cua mot bai tren Postgres THAT. Cai no chan la mot lan "don dep"
 * xoa mat chung ma khong ai nhan ra.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260907140000_transport_counterparty',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

describe('tang luu tru cua xuong song danh tinh (R1-A)', () => {
  it.each(['TransportCounterparty_name_not_blank', 'TransportCounterparty_taxCode_shape'])(
    'migration van khai `%s`',
    (name) => {
      expect(migration).toContain(name);
    },
  );

  /**
   * BAT BIEN CUA CA TRANCHE: mot hang chuyen mon thuoc TOI DA MOT phap nhan.
   *
   * Neu khoa chinh doi thanh mot `id` roi mot unique khac, lan ghi thu hai se tao ban sao thu hai
   * cua cung mot khach duoi hai phap nhan — va bao cao gop theo phap nhan se dem doi ma khong bao
   * loi o dau ca.
   */
  it('khoa chinh cua bang lien ket la cap `(kind, subjectId)`', () => {
    expect(migration).toContain(
      'CONSTRAINT "TransportCounterpartyLink_pkey" PRIMARY KEY ("kind","subjectId")',
    );
  });

  it('khuon ma so thue o DB trung voi khuon o zod', () => {
    // Cung mot bieu thuc, hai noi: DB dung ke ca khi mot duong ghi khac quen kiem.
    expect(migration).toContain("'^[0-9]{10}(-[0-9]{3})?$'");
  });

  it('lien ket bi don theo phap nhan chu — khong de lai hang mo coi', () => {
    expect(migration).toContain('ON DELETE CASCADE');
  });

  /**
   * Migration nay KHONG duoc sua mot bang nao da co.
   *
   * Do la ca ly do no duoc chon lam tranche dau tien: du lieu UAT tren `transport-preview/gd1-test`
   * — gom chuyen `UAT-VIET-01` ma #222 doi giu — khong bi mot lenh nao trong tep nay cham toi.
   */
  it('chi THEM: khong ALTER mot bang cu nao', () => {
    const alters = migration.match(/ALTER TABLE "(\w+)"/g) ?? [];
    for (const statement of alters) {
      expect(statement).toMatch(/"TransportCounterparty(Link)?"/);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/);
  });

  it('duong lui duoc ghi ra, va no go dung ba doi tuong da tao', () => {
    for (const name of [
      'TransportCounterpartyLink',
      'TransportCounterparty',
      'TransportCounterpartySubjectKind',
    ]) {
      expect(rollback).toContain(name);
    }
  });
});
