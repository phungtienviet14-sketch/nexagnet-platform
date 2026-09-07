import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PROOF-070 — rang buoc cua bang chung cu, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi `transport-proof-storage.spec.ts`: `prisma migrate dev` khong biet gi ve `CHECK`
 * nen no sinh lenh XOA chung, va mot bo bai kiem HANH VI se van xanh sau do — vi hanh vi o tang
 * tren khong doi, chi con co so du lieu la khong con bao ve gi nua.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260908120000_transport_operational_proof/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc luu tru cua chung cu van hanh — PROOF-070', () => {
  it('mot lan bam khong tao hai chung cu', () => {
    expect(MIGRATION).toContain('TransportOperationalProof_trip_kind_event_key');
  });

  it('MOT ban dinh vi phuc vu nhieu nhat MOT chung cu', () => {
    expect(MIGRATION).toContain('TransportOperationalProof_observationId_key');
  });

  it('ngay nghiep vu bi ep dung dang ISO', () => {
    expect(MIGRATION).toContain('TransportOperationalProof_businessDate_iso');
  });

  it('ma su kien rong bi chan — no lam khoa chan bam-hai-lan vo hieu', () => {
    expect(MIGRATION).toContain('TransportOperationalProof_clientEventId_not_blank');
  });

  /**
   * Mot chung cu bi rut ma khong biet AI rut la mot ban ghi khong tra loi duoc cau hoi duy nhat
   * nguoi ta se hoi khi mo no ra sau nay.
   */
  it('bia mo phai co CA HAI cot hoac KHONG CO GI — ca hai bang', () => {
    expect(MIGRATION).toContain('TransportOperationalProof_withdrawal_shape');
    expect(MIGRATION).toContain('TransportProofPhoto_withdrawal_shape');
  });

  it('anh phai co dinh vi that va kich thuoc duong', () => {
    expect(MIGRATION).toContain('TransportProofPhoto_locator_not_blank');
    expect(MIGRATION).toContain('TransportProofPhoto_byteSize_positive');
  });

  it('anh KHONG bi xoa theo chung cu — `Restrict`, khong `Cascade`', () => {
    // Bang bang chung: mot lan xoa chung cu khong duoc keo theo ca anh cua no.
    expect(MIGRATION).toMatch(/TransportProofPhoto_proofId_fkey[\s\S]{0,220}ON DELETE RESTRICT/);
  });

  it('KHONG dong vao bang cua mien khac', () => {
    const statements = MIGRATION.split('\n').filter(
      (line) => line.trimStart().startsWith('ALTER TABLE') || line.trimStart().startsWith('DROP '),
    );
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/ALTER TABLE "Transport/);
    }
  });

  it('KHONG xoa hay doi ten mot thu gi dang co', () => {
    expect(MIGRATION).not.toMatch(/^\s*DROP TABLE/m);
    expect(MIGRATION).not.toMatch(/RENAME/);
  });
});
