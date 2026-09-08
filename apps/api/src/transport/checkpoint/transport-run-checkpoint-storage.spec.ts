import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CP-070 — rang buoc cua bang moc, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi `transport-operational-proof-storage.spec.ts`: `prisma migrate dev` khong biet gi
 * ve `CHECK` va `TRIGGER`, nen no sinh lenh XOA chung o lan sinh migration ke tiep — va mot bo bai
 * kiem HANH VI se van xanh sau do, vi hanh vi o tang tren khong doi, chi con co so du lieu la
 * khong con bao ve gi nua.
 *
 * Nam hanh vi duoi day da duoc do TRUC TIEP tren Postgres 16 (08/09/2026) truoc khi viet bai nay;
 * bai nay chi giu chung khoi bien mat.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260909200000_transport_run_checkpoint/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc luu tru cua moc van hanh — CP-070', () => {
  it('mot lan bam khong tao hai moc', () => {
    expect(MIGRATION).toContain('TransportRunCheckpoint_run_type_event_key');
  });

  it('MOT ban dinh vi phuc vu nhieu nhat MOT moc', () => {
    expect(MIGRATION).toContain('TransportRunCheckpoint_observationId_key');
  });

  it('ngay nghiep vu bi ep dung dang ISO', () => {
    expect(MIGRATION).toContain('TransportRunCheckpoint_businessDate_iso');
  });

  it('ma su kien rong bi chan — no lam khoa chan bam-hai-lan vo hieu', () => {
    expect(MIGRATION).toContain('TransportRunCheckpoint_clientEventId_not_blank');
  });

  /**
   * Cung mot quy tac voi `isRunScoped()` o tang mien, dat lai o tang luu tru. Hai lop, va do la co
   * y: tang mien tu choi kem MOT MA DOC DUOC cho nguoi dung, tang luu tru chan mot duong ghi di
   * vong qua dich vu.
   */
  it('ba moc muc vong chay khong mang chang, sau moc con lai bat buoc mang chang', () => {
    expect(MIGRATION).toContain('TransportRunCheckpoint_leg_scope');
  });

  /**
   * BAI QUAN TRONG NHAT cua tep nay. `#243` F1 doi *"append-only/auditable history"*, va mot bang
   * bang chung chi duoc bao ve boi tang mien thi van sua duoc bang mot dong `psql`.
   */
  it('moc khong sua duoc va khong xoa duoc — trigger, khong phai loi khuyen', () => {
    expect(MIGRATION).toContain('transport_run_checkpoint_append_only');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "TransportRunCheckpoint"');
  });

  /**
   * `Restrict`, khong `Cascade` — tren ca bon khoa ngoai.
   *
   * Mot lan xoa vong chay/chang/lai xe/ban dinh vi khong duoc keo theo lich su moc cua no. Neu
   * `Cascade` lot vao day thi chinh cai trigger o tren tro nen vo nghia: khong ai `DELETE` bang
   * moc ca, ho `DELETE` cai bang cha.
   */
  it('khong khoa ngoai nao xoa lan sang moc', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        line.includes('TransportRunCheckpoint_') &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);
    expect(MIGRATION).toContain('"TransportRunCheckpoint_runId_fkey"');
    expect(MIGRATION).toContain('"TransportRunCheckpoint_legId_fkey"');
    expect(MIGRATION).toContain('"TransportRunCheckpoint_driverId_fkey"');
    expect(MIGRATION).toContain('"TransportRunCheckpoint_observationId_fkey"');
  });

  /**
   * Migration nay KHONG duoc mang theo do lech co san cua nhanh khac.
   *
   * `prisma migrate diff` gom moi khac biet giua migration va schema, ke ca do lech cua mien khac
   * (`DealerPriceOverride`, `User`, `TransportFuelCandidate` — do duoc 08/09/2026). De chung lot
   * vao day se lam mot PR ve moc van hanh am tham doi cau truc bang cua nguoi khac.
   */
  it('khong cham vao bang cua mien khac', () => {
    expect(MIGRATION).not.toContain('DealerPriceOverride');
    expect(MIGRATION).not.toContain('TransportFuelCandidate');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
  });
});
