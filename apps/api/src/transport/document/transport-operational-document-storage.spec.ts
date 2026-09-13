import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * DC-080 — rang buoc cua bang chung tu va bang ban giao, doc CHINH TEP MIGRATION.
 *
 * Cung ly le voi `transport-run-checkpoint-storage.spec.ts`: `prisma migrate dev` khong biet gi ve
 * `CHECK`, ve unique MOT PHAN va ve `TRIGGER`, nen no sinh lenh XOA chung o lan sinh migration ke
 * tiep — va mot bo bai kiem HANH VI se van xanh sau do.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../prisma/migrations/20260911180000_transport_operational_document/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Rang buoc luu tru cua chung tu van hanh — DC-080', () => {
  it('mot lan bam khong ghi hai to', () => {
    expect(MIGRATION).toContain('TransportOperationalDocument_run_type_event_key');
    expect(MIGRATION).toContain('TransportOperationalDocument_clientEventId_not_blank');
  });

  /**
   * Neu mot ma tep dung duoc cho nhieu chung tu thi mot nguoi gan DUNG MOT tam anh vao ca bon loai
   * phieu — tuc mot chuyen "day du chung tu" chi bang mot lan chup.
   */
  it('mot ma tep phuc vu nhieu nhat MOT chung tu dang hieu luc — unique MOT PHAN', () => {
    expect(MIGRATION).toContain('TransportOperationalDocument_activeFile_key');
    expect(MIGRATION).toMatch(/WHERE "fileId" IS NOT NULL AND "status" = 'ACTIVE'/);
  });

  /**
   * Mot hang khai `DIGITAL_FILE` ma khong co ma tep la mot chung tu ban so KHONG CO ban so nao — va
   * no van dem duoc trong moi phep dem "co bao nhieu chung tu".
   */
  it('can cu va ma tep di cung nhau, hoac khong cai nao', () => {
    expect(MIGRATION).toContain('TransportOperationalDocument_basis_shape');
    expect(MIGRATION).toMatch(/"basis" = 'DIGITAL_FILE' AND "fileId" IS NOT NULL/);
  });

  it('mot to da bia mo phai noi duoc AI bia va LUC NAO', () => {
    expect(MIGRATION).toContain('TransportOperationalDocument_withdraw_shape');
  });

  it('ngay nghiep vu bi ep dung dang ISO', () => {
    expect(MIGRATION).toContain('TransportOperationalDocument_businessDate_iso');
    expect(MIGRATION).toContain('TransportPhysicalReceiptHandover_businessDate_iso');
  });

  /**
   * `orderId` NAM TRONG danh sach khoa cua trigger, va do la dong quan trong nhat: `#279` O13 bai 8
   * doi rang mot to bien nhan cua don A khong thoa man duoc don B. Neu cot do sua duoc bang mot
   * dong `psql` thi cong o tang mien khong con y nghia.
   */
  it('chung tu chi di duoc tu ACTIVE sang WITHDRAWN, va MA DON khoa cung', () => {
    expect(MIGRATION).toContain('transport_operational_document_immutable');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "TransportOperationalDocument"');
    expect(MIGRATION).toContain('mot chung tu chi di duoc tu ACTIVE sang WITHDRAWN');
    for (const locked of ['"orderId"', '"fileId"', '"type"', '"recordedBy"', '"basis"']) {
      expect(MIGRATION).toContain(locked);
    }
  });
});

describe('Rang buoc luu tru cua ban giao bien nhan — DC-081', () => {
  it('mot lan bam khong ghi hai buoc, va mot buoc chi ghi mot lan', () => {
    expect(MIGRATION).toContain('TransportPhysicalReceiptHandover_order_event_key');
    expect(MIGRATION).toContain('TransportPhysicalReceiptHandover_order_state_key');
    expect(MIGRATION).toContain('TransportPhysicalReceiptHandover_order_sequence_key');
  });

  /**
   * `#279` O7 doi duong giay phai di duoc *"using an auditable external-physical basis rather than
   * a fake file"* — nen mot buoc trong CA HAI can cu la mot su that khong doi chieu duoc voi gi.
   */
  it('mot buoc ban giao phai co can cu: ban so, hoac mot cau mo ta ban giay', () => {
    expect(MIGRATION).toContain('TransportPhysicalReceiptHandover_basis');
  });

  /**
   * CHAT HON trigger cua bang chung tu: o day KHONG co truong nao doi duoc, vi mot buoc ban giao
   * khong co vong doi — no chi don gian la da xay ra.
   */
  it('chuoi ban giao la so ghi them — khong sua, khong xoa', () => {
    expect(MIGRATION).toContain('transport_physical_receipt_handover_append_only');
    expect(MIGRATION).toContain('BEFORE UPDATE OR DELETE ON "TransportPhysicalReceiptHandover"');
  });

  it('khong khoa ngoai nao xoa lan sang chung tu hay ban giao', () => {
    const cascades = MIGRATION.split('\n').filter(
      (line) =>
        (line.includes('TransportOperationalDocument_') ||
          line.includes('TransportPhysicalReceiptHandover_')) &&
        line.includes('FOREIGN KEY') &&
        line.includes('ON DELETE CASCADE'),
    );
    expect(cascades).toEqual([]);
    expect(MIGRATION).toContain('"TransportOperationalDocument_orderId_fkey"');
    expect(MIGRATION).toContain('"TransportPhysicalReceiptHandover_documentId_fkey"');
  });

  /** `#279` O7 — mien nay khong cham vao truc nghiem thu, ke ca o tang luu tru. */
  it('khong cham vao bang cua mien khac', () => {
    expect(MIGRATION).not.toMatch(/ALTER TABLE "TransportOrder"/);
    expect(MIGRATION).not.toContain('TransportCommercialAcceptance');
    expect(MIGRATION).not.toContain('DealerPriceOverride');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "User"/);
  });
});
