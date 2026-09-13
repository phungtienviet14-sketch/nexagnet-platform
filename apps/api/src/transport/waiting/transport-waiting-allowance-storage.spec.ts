import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WA-070 — rang buoc cua bang phu cap cho, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi `transport-waiting-session-storage.spec.ts`, va o day nang hon mot bac: mot hang
 * cua bang nay la MOT KHOAN TIEN DI VAO LUONG cua mot con nguoi. Mot rang buoc bien mat o day
 * khong lam hong mot bao cao — no lam hong mot lan tra luong.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260911170000_transport_waiting_allowance/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc luu tru cua phu cap cho — WA-070', () => {
  /** `#279` O13 bai 11 — cong THAT chong tra tien hai lan. */
  it('mot phien cho co nhieu nhat MOT khoan DA DUYET — unique MOT PHAN', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_approvedSession_key');
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX "TransportDriverWaitingAllowance_approvedSession_key"/,
    );
    expect(MIGRATION).toMatch(/WHERE "status" = 'APPROVED'/);
  });

  it('mot lan bam `Duyet` gui lai khong quyet lan hai', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_decisionKey_key');
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_decisionKey_not_blank');
  });

  /**
   * Nguoi duyet CAT BOT duoc, KHONG cong them duoc. Cuong che o tang luu tru chu khong chi o
   * `evaluateAllowanceDecision`: mot lenh `psql` viet tay cung khong vuot qua duoc.
   */
  it('so duyet khong duoc lon hon so de nghi, va ca hai la so nguyen duong', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_amount_range');
    expect(MIGRATION).toContain('"approvedAmount" <= "candidateAmount"');
  });

  /**
   * Mot hang `REJECTED` mang mot so tien la mot khoan da bi tu choi van doc ra duoc mot con so —
   * va lan doc bat can dau tien se tra no vao luong.
   */
  it('so tien duoc duyet chi ton tai o DUNG mot trang thai', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_decision_shape');
    expect(MIGRATION).toMatch(/"status" = 'REJECTED'[\s\S]*?"approvedAmount" IS NULL/);
  });

  it('mot de nghi khong co ly do thi khong ghi duoc', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_reason_not_blank');
  });

  it('ngay nghiep vu bi ep dung dang ISO', () => {
    expect(MIGRATION).toContain('TransportDriverWaitingAllowance_businessDate_iso');
  });

  /**
   * `#279` O6: *"approving user cannot rewrite WaitingSession timestamps"*, va o day rong hon mot
   * buoc — nguoi duyet cung khong sua duoc CON SO DE NGHI ma ho dang duyet. Neu sua duoc thi cong
   * duyet chi con la mot o nhap lieu thu hai.
   */
  it('chi ghi duoc phan QUYET DINH; phan DE NGHI khoa cung', () => {
    expect(MIGRATION).toContain('transport_waiting_allowance_immutable');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "TransportDriverWaitingAllowance"');
    for (const locked of ['"candidateAmount"', '"proposedBy"', '"proposedAt"', '"reason"']) {
      expect(MIGRATION).toContain(locked);
    }
  });

  it('mot de nghi da quyet khong quay lai trang thai CHO', () => {
    expect(MIGRATION).toContain('chi di duoc tu PENDING sang APPROVED hoac REJECTED');
  });

  /**
   * Gia tri enum moi cua nguon thanh phan luong — day la duong DUY NHAT khoan tien nay vao bang
   * luong. Thieu no thi `WorkforceService` nem luc ghi, va no nem o giua mot lan chay luong.
   */
  it('bang luong co mot nguon RIENG cho khoan nay', () => {
    expect(MIGRATION).toContain(
      `ALTER TYPE "TransportPayslipComponentSource" ADD VALUE IF NOT EXISTS 'WAITING_ALLOWANCE'`,
    );
  });

  it('khong khoa ngoai nao xoa lan sang phu cap', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        line.includes('TransportDriverWaitingAllowance_') &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);
    expect(MIGRATION).toContain('"TransportDriverWaitingAllowance_waitingSessionId_fkey"');
    expect(MIGRATION).toContain('"TransportDriverWaitingAllowance_driverId_fkey"');
  });

  /** `#279` O6 — khong mot nghia vu nao cua KHACH duoc sinh ra o day. */
  it('khong cham vao bang khach hang, chung tu quyet toan hay bang cua mien khac', () => {
    expect(MIGRATION).not.toContain('TransportSettlementDocument');
    expect(MIGRATION).not.toContain('TransportCustomer');
    expect(MIGRATION).not.toContain('DealerPriceOverride');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE "TransportPayslip"/);
  });
});
