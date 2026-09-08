import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE_DECISION_IDEMPOTENCY,
  ACCEPTANCE_DECISION_SEQUENCE,
} from './acceptance-storage-conflict.js';

/**
 * CA-020 — RANG BUOC CUA `transport-acceptance` SONG TRONG SQL THO, NEN BAI NAY DOC SQL THO.
 *
 * `prisma migrate dev` sinh migration bang cach diff schema voi DB, va no khong biet gi ve `CHECK`
 * lan `TRIGGER`. Nghia la lan sinh migration ke tiep SE sinh lenh xoa chung. Neu chi co bai kiem
 * HANH VI, moi thu van XANH sau lan xoa do — hanh vi cua tang tren khong doi, chi con co so du lieu
 * la khong con bao ve gi nua.
 *
 * Cung khuon `transport-run-checkpoint-storage.spec.ts` va `transport-proof-storage.spec.ts`.
 */
const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260910090000_transport_commercial_acceptance/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc kho cua nghiem thu chung tu — CA-020', () => {
  it('mot vong chay chi co MOT ho so nghiem thu', () => {
    expect(MIGRATION).toContain('TransportCommercialAcceptance_runId_key');
  });

  it('so thu tu quyet dinh la duy nhat trong mot ho so', () => {
    expect(MIGRATION).toContain(ACCEPTANCE_DECISION_SEQUENCE.indexName);
  });

  /**
   * KHOA CHONG GHI TRUNG — `#268` I4. Tang dich vu co doc truoc mot lan cho duong phat lai nhanh,
   * nhung mot phep doc-roi-ghi khong bao gio la nguyen tu: hai yeu cau cung khoa den cung luc se
   * cung thay "chua co". Rang buoc nay la cho DUY NHAT tra loi duoc cau hoi do.
   */
  it('mot khoa chong ghi trung chi ghi duoc MOT quyet dinh', () => {
    expect(MIGRATION).toContain(ACCEPTANCE_DECISION_IDEMPOTENCY.indexName);
  });

  it('ngay nghiep vu bi ep ve dang ISO', () => {
    expect(MIGRATION).toContain('TransportCommercialAcceptance_businessDate_iso');
  });

  it('so thu tu bat dau tu 1', () => {
    expect(MIGRATION).toContain('TransportCommercialAcceptanceDecision_sequence_positive');
  });

  it('ma ly do va nguoi quyet khong duoc rong', () => {
    expect(MIGRATION).toContain('TransportCommercialAcceptanceDecision_reason_not_blank');
    expect(MIGRATION).toContain('TransportCommercialAcceptanceDecision_decidedBy_not_blank');
  });

  /**
   * BAI QUAN TRONG NHAT CUA TEP — `#268` I7 bai 11.
   *
   * *"Approved decision cannot be silently edited after settlement lock."* Mot doan ma dich vu chi
   * chung minh duoc rang DUONG DO khong sua. Trigger chung minh ca voi mot cau `UPDATE` viet tay.
   */
  it('lich su quyet dinh la CHI GHI THEM, cuong che bang trigger', () => {
    expect(MIGRATION).toContain('transport_commercial_acceptance_append_only');
    expect(MIGRATION).toContain(
      'BEFORE UPDATE OR DELETE ON "TransportCommercialAcceptanceDecision"',
    );
  });

  /**
   * Trigger chan CA `DELETE`, nen khoa ngoai phai la `RESTRICT`. Mot `CASCADE` o day se lam mot
   * lenh xoa day chuyen that bai o TRIGGER thay vi o FK — dung ket qua, nhung thong diep loi se
   * khong noi duoc rang chinh lich su moi la thu dang chan.
   */
  it('khong khoa ngoai nao xoa day chuyen', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        line.includes('TransportCommercialAcceptance') &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);

    expect(MIGRATION).toContain('TransportCommercialAcceptance_runId_fkey');
    expect(MIGRATION).toContain('TransportCommercialAcceptance_counterpartyId_fkey');
    expect(MIGRATION).toContain('TransportCommercialAcceptanceDecision_acceptanceId_fkey');
  });

  /**
   * `PENDING` KHONG nam trong enum, va do la mot khang dinh chu khong mot thieu sot: no la SU VANG
   * MAT cua mot hang. Neu no duoc them vao enum, thi se co hai cach bieu dien "chua ai nghiem thu"
   * — mot hang mang `PENDING` va khong co hang nao — va hai cach do se co luc noi khac nhau.
   */
  it('enum ket qua KHONG chua PENDING', () => {
    expect(MIGRATION).toContain(
      "CREATE TYPE \"TransportCommercialAcceptanceOutcome\" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_CORRECTION')",
    );
  });
});

/**
 * CA-021 — BAN KINH VU NO.
 *
 * `prisma migrate diff` gom ca do lech co san cua schema vao migration moi. Bo bai nay do neu mot
 * lan sinh lai keo theo mot bang cua mien khac — cung khuon voi bai tuong ung cua Lane B va F.
 */
describe('Migration nay KHONG cham vao mien nao khac — CA-021', () => {
  it('moi lenh doi cau truc deu tren bang Transport', () => {
    const touched = MIGRATION.split('\n').filter(
      (line) => line.startsWith('ALTER TABLE ') || line.startsWith('DROP '),
    );
    expect(touched.length).toBeGreaterThan(0);
    for (const line of touched) {
      expect(line).toMatch(/^(ALTER TABLE|DROP) "Transport/);
    }
  });

  it('khong xoa bang, khong doi ten, khong cham bang cua khach khac', () => {
    expect(MIGRATION).not.toMatch(/^\s*DROP TABLE/m);
    expect(MIGRATION).not.toMatch(/RENAME/);
    expect(MIGRATION).not.toContain('DealerPriceOverride');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
  });
});
