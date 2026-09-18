import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * RANG BUOC LUU TRU cua nen tang tep, doc CHINH TEP MIGRATION — `#287` P3/P8.
 *
 * Cung ly le voi `transport-operational-document-storage.spec.ts`: `prisma migrate dev` khong biet
 * gi ve `CHECK`, ve unique MOT PHAN va ve `TRIGGER`, nen no sinh lenh XOA chung o lan sinh migration
 * ke tiep — va mot bo bai kiem HANH VI se van xanh sau do.
 */
const MIGRATION = readFileSync(
  fileURLToPath(
    new URL('../../prisma/migrations/20260918100000_platform_file/migration.sql', import.meta.url),
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Bat bien cua bang tep — PF-050', () => {
  /**
   * `storageKey` la mot cot chuoi TU DO. Neu no nhan duoc mot gia tri ngoai khu cua nen tang, thi
   * duong doc thanh mot cong DOC TUY Y trong bucket — va duong don byte thanh mot cong XOA tuy y.
   */
  it('khoa luu tru bi ep nam trong khu cua nen tang, o TANG CSDL', () => {
    expect(MIGRATION).toContain('PlatformFile_storageKey_scope');
    expect(MIGRATION).toContain("LIKE 'media/platform-file/%'");
    expect(MIGRATION).toContain("NOT LIKE '%..%'");
  });

  it('bam bi ep dung dang hex thuong 64 ky tu', () => {
    expect(MIGRATION).toContain('PlatformFile_sha256_hex');
    expect(MIGRATION).toContain("'^[0-9a-f]{64}$'");
  });

  /**
   * Mot hang `WITHDRAWN` khong noi duoc AI rut va LUC NAO la mot to bang chung bien mat khong dau
   * vet. Va `PURGED` doi PHAI di qua `WITHDRAWN`/`QUARANTINED`: byte cua mot tep dang hieu luc
   * khong duoc don, ke ca khi tang ung dung bi di vong.
   */
  it('moi trang thai co mot hinh dang bat buoc', () => {
    expect(MIGRATION).toContain('PlatformFile_lifecycle_shape');
    expect(MIGRATION).toMatch(/"state" = 'WITHDRAWN'[\s\S]{0,120}"withdrawnBy" IS NOT NULL/);
    expect(MIGRATION).toMatch(/"state" = 'PURGED'[\s\S]{0,200}"quarantinedAt" IS NOT NULL/);
  });

  it('mot lan don byte hong phai noi duoc LUC NAO va MA GI', () => {
    expect(MIGRATION).toContain('PlatformFile_purge_failure_shape');
    expect(MIGRATION).toContain('("purgeFailedAt" IS NULL) = ("purgeFailureCode" IS NULL)');
  });

  /**
   * `#287` P3 bat bien 1 — va o day thi khong hard-delete KE CA SAU khi don byte. Danh sach cot
   * khoa cung quan trong khong kem: `storageKey` sua duoc nghia la mot hang da rut co the tro sang
   * byte cua tep khac, tuc vong doi bi di vong ma khong lenh xoa nao duoc goi.
   */
  it('mot tep da ghi khong xoa duoc, va danh tinh cua no khong doi', () => {
    expect(MIGRATION).toContain('platform_file_immutable');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "PlatformFile"');
    for (const locked of [
      '"sha256"',
      '"storageKey"',
      '"byteSize"',
      '"purpose"',
      '"createdBy"',
      '"storageProvider"',
    ]) {
      expect(MIGRATION).toContain(locked);
    }
  });

  it('vong doi chi di mot chieu', () => {
    expect(MIGRATION).toContain('mot tep da don byte khong quay lai duoc');
    expect(MIGRATION).toContain('khong kich hoat lai duoc');
  });

  /**
   * `#287` P3 bat bien 7 + P12 bai 12, lap lai o TANG CSDL: mot lenh giu theo phap ly ma mot dong
   * `psql` di qua duoc thi no khong phai mot lenh giu.
   */
  it('luu tru va lenh giu phap ly chan don byte ngay o CSDL', () => {
    expect(MIGRATION).toContain('platform_file_purge_guard');
    expect(MIGRATION).toContain('BEFORE UPDATE ON "PlatformFile"');
    expect(MIGRATION).toContain('"legalHold"');
    expect(MIGRATION).toMatch(/"retainUntil" IS NOT NULL AND NEW\."retainUntil" > now\(\)/);
  });
});

describe('Bat bien cua bang lien ket — PF-051', () => {
  /** Mot lan bam hai lan khong duoc sinh ra hai lien ket giong het nhau. */
  it('MOT lien ket dang hieu luc cho mot bo — unique MOT PHAN', () => {
    expect(MIGRATION).toContain('PlatformFileLink_activeLink_key');
    expect(MIGRATION).toMatch(/WHERE "state" = 'ACTIVE'/);
  });

  /**
   * Neu `businessOwnerId` sua duoc thi mot to bien nhan cua don A se thoa man duoc don B — dung lo
   * hong ma `#279` O13 bai 8 va `#287` P11 deu ton tai de chan.
   */
  it('mot lien ket da ghi khong tro sang doi tuong khac duoc, va khong xoa duoc', () => {
    expect(MIGRATION).toContain('platform_file_link_append_only');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "PlatformFileLink"');
    expect(MIGRATION).toContain('khong tro sang doi tuong khac duoc');
  });

  it('mot lien ket da go phai noi duoc AI go va LUC NAO', () => {
    expect(MIGRATION).toContain('PlatformFileLink_withdraw_shape');
  });

  /** Khoa ngoai KHONG duoc xoa lan: mot lien ket bien mat la mot to bang chung mat dau vet. */
  it('khong khoa ngoai nao xoa lan sang tep hay lien ket', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        line.includes('PlatformFile') &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);
    expect(MIGRATION).toContain('"PlatformFileLink_fileId_fkey"');
    expect(MIGRATION).toContain('ON DELETE RESTRICT');
  });

  /** `#287` P14: lane nay khong cham vao bang cua mien khac. */
  it('migration khong cham vao bang cua mien nao khac', () => {
    expect(MIGRATION).not.toMatch(/ALTER TABLE "Transport/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE "Order"/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
    expect(MIGRATION).not.toContain('DROP TABLE');
    expect(MIGRATION).not.toContain('DROP COLUMN');
  });
});
