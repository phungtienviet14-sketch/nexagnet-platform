import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WT-070 — rang buoc cua bang phien cho, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi `transport-run-checkpoint-storage.spec.ts`: `prisma migrate dev` khong biet gi ve
 * `CHECK`, ve unique MOT PHAN va ve `TRIGGER`, nen no sinh lenh XOA chung o lan sinh migration ke
 * tiep — va mot bo bai kiem HANH VI se van xanh sau do, vi hanh vi o tang tren khong doi, chi con
 * co so du lieu la khong con bao ve gi nua.
 *
 * O bang nay dieu do nang hon o bang moc: mot hang cua bang nay la CAN CU CUA MOT KHOAN TIEN
 * (`#279` O6). Mot rang buoc bien mat o day khong lam hong mot bao cao — no lam hong mot lan tra
 * luong.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260911160000_transport_waiting_session/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc luu tru cua phien cho — WT-070', () => {
  /**
   * BAI QUAN TRONG NHAT cua tep nay — `#279` O13 bai 5.
   *
   * Phai la unique MOT PHAN (`WHERE "status" = 'OPEN'`). Mot unique day du tren `legId` se chan
   * luon lich su: mot chang CO THE co nhieu phien da dong.
   */
  it('mot chang co nhieu nhat MOT phien dang mo — unique MOT PHAN', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_openLeg_key');
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_openLeg_key"/);
    expect(MIGRATION).toMatch(/WHERE "status" = 'OPEN'/);
  });

  /**
   * `arrivalCheckpointId` KHONG duoc unique — mot khang dinh do duoc tren Postgres that (WT-IT-09).
   *
   * Ban dau cot nay CO `@unique`, va bai WT-IT-09 do ngay: van phong dong nham mot phien roi lai xe
   * van con phai cho THAT, nhung khong mo lai duoc vi neo da bi dung. Mot khoang cho that khong ghi
   * duoc la mot can cu bi mat, va lai xe la nguoi chiu.
   *
   * Bat bien that hep hon: mot chang, mot phien DANG MO.
   */
  it('mot lan den noi de duoc nhieu phien cho noi tiep nhau', () => {
    expect(MIGRATION).not.toContain(
      'CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_arrivalCheckpointId_key"',
    );
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_arrivalCheckpointId_idx');
  });

  /** MOT moc `DELIVERY_ACCEPTED` dong NHIEU NHAT mot phien — chieu nay thi unique la dung. */
  it('mot lan nhan hang dong nhieu nhat MOT phien', () => {
    expect(MIGRATION).toContain(
      'CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_closingCheckpointId_key"',
    );
  });

  it('mot lan bam gui lai khong tao phien thu hai', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_leg_event_key');
  });

  /** `#279` O13 bai 4 — mot khoang AM di thang vao con so phu cap. */
  it('gio dong khong duoc nam truoc gio mo', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_period_order');
    expect(MIGRATION).toContain('"endedAt" IS NULL OR "endedAt" >= "startedAt"');
  });

  /**
   * Mot hang `CLOSED` voi `endedAt IS NULL` la mot phien "da dong" ma thoi luong van chay mai — no
   * se hien tren bang dieu hanh nhu mot chiec xe dang cho ba hom nay.
   */
  it('mot phien da dong phai dong DAY DU — bon truong di cung nhau', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_close_pairing');
  });

  it('van hanh dong mot phien thi bat buoc noi ly do', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_operator_close_note');
  });

  it('ngay nghiep vu bi ep dung dang ISO', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_businessDate_iso');
  });

  it('ma su kien rong bi chan — no lam khoa chan bam-hai-lan vo hieu', () => {
    expect(MIGRATION).toContain('TransportDeliveryWaitingSession_clientEventId_not_blank');
  });

  /**
   * `#279` O6: *"approving user cannot rewrite WaitingSession timestamps"*.
   *
   * Tang mien da khong mo ham nao lam duoc viec do (`WaitingSessionRepository` khong co `update`),
   * nhung mot bang la can cu cua mot khoan tien thi khong duoc chi dua vao ky luat cua tang mien.
   */
  it('phien cho chi di duoc tu OPEN sang CLOSED, va phan MO khong sua duoc', () => {
    expect(MIGRATION).toContain('transport_waiting_session_immutable');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "TransportDeliveryWaitingSession"');
    expect(MIGRATION).toContain('mot phien cho chi di duoc tu OPEN sang CLOSED');
    for (const locked of ['"startedAt"', '"startedBy"', '"reason"', '"arrivalCheckpointId"']) {
      expect(MIGRATION).toContain(locked);
    }
  });

  /**
   * `Restrict`, khong `Cascade` — tren ca nam khoa ngoai. Mot lan xoa vong chay/chang/lai xe/moc
   * khong duoc keo theo lich su cho cua no; neu `Cascade` lot vao day thi chinh cai trigger o tren
   * tro nen vo nghia, vi khong ai `DELETE` bang phien cho ca — ho `DELETE` bang cha.
   */
  it('khong khoa ngoai nao xoa lan sang phien cho', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        line.includes('TransportDeliveryWaitingSession_') &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);
    for (const fk of ['runId', 'legId', 'driverId', 'arrivalCheckpointId', 'closingCheckpointId']) {
      expect(MIGRATION).toContain(`"TransportDeliveryWaitingSession_${fk}_fkey"`);
    }
  });

  /**
   * Migration nay KHONG duoc mang theo do lech co san cua nhanh khac. `prisma migrate diff` gom moi
   * khac biet giua migration va schema, ke ca do lech cua mien khac.
   */
  it('khong cham vao bang cua mien khac', () => {
    expect(MIGRATION).not.toContain('DealerPriceOverride');
    expect(MIGRATION).not.toContain('TransportFuelCandidate');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE "TransportPayslip"/);
  });

  /**
   * KHONG CO COT `durationSeconds`. Thoi luong la mot PHEP TRU doc luc doc — mot cot se la cau tra
   * loi THU HAI cho cung mot cau hoi, va `#243` F3 doi no phai duoc suy ra tat dinh chu khong sua
   * tay thanh su that.
   */
  it('khong co cot thoi luong nao de ai do sua tay', () => {
    expect(MIGRATION).not.toContain('durationSeconds');
    expect(MIGRATION).not.toContain('durationMinutes');
  });
});
