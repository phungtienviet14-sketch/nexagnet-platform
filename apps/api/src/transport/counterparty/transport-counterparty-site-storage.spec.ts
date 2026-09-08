import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua TX-09 (`#267` H1) — nhung thu `schema.prisma` khong noi duoc.
 *
 * Hai `CHECK` va mot khoa ngoai `RESTRICT` song trong SQL tho. `prisma migrate dev` sinh migration
 * bang cach diff schema voi DB, nen no se sinh lenh xoa ca hai `CHECK`. He thong van chay binh
 * thuong sau do, chi khong con chan gi: mot dia diem ten rong se ghi duoc, va no hien ra tren man
 * hinh lai xe nhu mot the trang co the cham vao.
 *
 * Bo test nay doc CHINH tep migration va do neu mot ten khong con. No khong the hien constraint co
 * hieu luc hay khong — do la viec cua bai tren Postgres THAT. Cai no chan la mot lan "don dep"
 * xoa mat chung ma khong ai nhan ra.
 */

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../prisma/migrations');
const TABLE_DIR = join(MIGRATIONS, '20260909230100_transport_counterparty_site');

const table = readFileSync(join(TABLE_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(TABLE_DIR, 'README-rollback.sql'), 'utf8');
const enumValue = readFileSync(
  join(MIGRATIONS, '20260909230000_transport_geofence_counterparty_site_kind', 'migration.sql'),
  'utf8',
);

describe('tang luu tru cua dia diem van hanh (TX-09)', () => {
  it.each([
    'TransportCounterpartySite_name_not_blank',
    'TransportCounterpartySite_address_not_blank',
  ])('migration van khai `%s`', (name) => {
    expect(table).toContain(name);
  });

  /**
   * Hai kho cua CUNG mot cong ty khong duoc trung ten. Bo unique nay di thi hai dong chu giong het
   * nhau se hien ra trong danh sach ung vien, va lai xe khong co cach nao chon dung.
   */
  it('ten dia diem la duy nhat TRONG mot phap nhan', () => {
    expect(table).toContain(
      'CREATE UNIQUE INDEX "TransportCounterpartySite_counterparty_name_key"',
    );
    expect(table).toContain('("counterpartyId", "name")');
  });

  /**
   * `RESTRICT`, khong `CASCADE`. Bo mot phap nhan la mot viec khong ai duoc lam am tham keo theo
   * ca danh sach kho cua ho — `GD-02` doi duong nghi viec la `status`.
   */
  it('bo phap nhan bi CHAN khi con dia diem', () => {
    expect(table).toContain('"TransportCounterpartySite_counterpartyId_fkey"');
    expect(table).toContain('ON DELETE RESTRICT');
    expect(table).not.toContain('ON DELETE CASCADE');
  });

  /**
   * MIGRATION NAY KHONG DUOC SUA MOT BANG NAO DA CO.
   *
   * `#267` H1 doi *"additive/backward-compatible"*, va `#266` cam dong vao du lieu khach dang chay.
   * Mot cau lenh doi cot lot vao day se doi mot bang ma mot lane khac so huu.
   */
  it('khong sua mot cot hay bang nao dang ton tai', () => {
    const alters = [...table.matchAll(/ALTER TABLE "([A-Za-z]+)"/g)].map((match) => match[1]);
    expect(new Set(alters)).toEqual(new Set(['TransportCounterpartySite']));
    expect(table).not.toMatch(/ALTER COLUMN/i);
    expect(table).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });

  /**
   * Gia tri enum phai o MOT TEP RIENG. Postgres cam dung mot gia tri enum vua them trong cung giao
   * dich, va Prisma boc moi tep migration trong mot giao dich — nen gop hai viec lam mot tep chi
   * hong VAO LUC ai do them mot `CHECK` co nhac ten gia tri moi. Cung bay da giang o
   * `20260908110000_transport_driver_fund_reimbursement_kind`.
   */
  it('gia tri enum nam rieng mot migration, va khai IF NOT EXISTS', () => {
    expect(enumValue).toContain(
      'ALTER TYPE "TransportGeofenceSubjectKind" ADD VALUE IF NOT EXISTS',
    );
    expect(enumValue).toContain('COUNTERPARTY_SITE');
    expect(enumValue).not.toContain('CREATE TABLE');
    expect(table).not.toContain('ALTER TYPE');
  });

  /**
   * KHONG MOT TRUONG TIEN NAO. `#267` H1: *"no money semantics"*.
   *
   * Mot dia diem tra loi cau hoi "xe dang dung o dau". Cau "hoa don xuat cho ai" va "cuoc bao
   * nhieu" thuoc ve `TransportOrder`/`TransportSettlementDocument`, va chung phai o nguyen do.
   */
  it('bang dia diem khong mang mot cot tien nao', () => {
    const columns = table.slice(
      table.indexOf('CREATE TABLE'),
      table.indexOf('CREATE UNIQUE INDEX'),
    );
    for (const money of ['amount', 'price', 'currency', 'freight', 'fee', 'cost']) {
      expect(columns.toLowerCase()).not.toContain(money);
    }
  });

  /**
   * Ban lui phai NOI RA rang gia tri enum khong lui duoc. Mot tep rollback im lang ve dieu do se
   * lam nguoi truc tin rang ho da tra he thong ve trang thai cu.
   */
  it('ban lui noi ro gia tri enum khong go duoc', () => {
    expect(rollback).toContain('COUNTERPARTY_SITE');
    expect(rollback).toContain('KHONG lui duoc');
  });
});
