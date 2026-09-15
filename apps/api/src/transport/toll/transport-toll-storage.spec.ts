import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * RANG BUOC LUU TRU CUA `TX-08` MO RONG (ETC) — doc CHINH TEP MIGRATION.
 *
 * ===========================================================================
 * VI SAO PHAI DOC TEP SQL chu khong `schema.prisma`, va vi sao tep nay ton tai muon.
 *
 * `prisma migrate dev` khong biet gi ve `CHECK`, `TRIGGER` va unique MOT PHAN. Khong cai nao trong
 * so do bieu dien duoc bang `schema.prisma`, nen lan sinh migration ke tiep se sinh lenh XOA chung
 * — va mot bo bai kiem HANH VI se van xanh sau do, vi hanh vi o tang tren khong doi, chi con co so
 * du lieu la khong con bao ve gi nua. Bon mien anh em deu da co mot tep nhu tep nay
 * (`transport-run-checkpoint-storage.spec.ts`, `transport-costing-storage.spec.ts`,
 * `transport-fuel-storage.spec.ts`, `transport-asset-workforce-storage.spec.ts`).
 *
 * Mien ETC thi KHONG, va do la ly do mot lo hong song duoc tu Lane J toi `#295`: `schema.prisma`
 * HUA rang lich su quyet dinh review la *"GHI THEM, khong bao gio ghi de"*, nhung khong mot rang
 * buoc CSDL nao giu loi hua do — mot dong `psql` sua duoc, va khong ai biet.
 *
 * `toContain` chu khong so khop ca khoi: worktree tren Windows la CRLF con blob git la LF, nen moi
 * phep so co `\n` deu se do gia o mot ben.
 */

const read = (folder: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../prisma/migrations/${folder}/migration.sql`, import.meta.url)),
    'utf8',
  );

const INGESTION = read('20260910100000_transport_toll_ingestion');
const APPEND_ONLY = read('20260915130000_transport_toll_append_only');

describe('Rang buoc luu tru cua nap ETC — Lane J + #295 Lane V', () => {
  /* ================================================================== *
   * CHI GHI THEM — `#295` Lane V
   * ================================================================== */

  /**
   * BAI QUAN TRONG NHAT cua tep nay.
   *
   * Mot ban ghi quyet dinh review la BANG CHUNG: ai doi xe nao, luc nao, vi ly do gi. Neu no sua
   * duoc thi cau hoi *"vi sao dong nay lai gan cho xe X"* khong con cau tra loi dang tin nao.
   */
  it('quyet dinh review khong sua duoc va khong xoa duoc — trigger, khong phai loi khuyen', () => {
    expect(APPEND_ONLY).toContain('transport_toll_review_decision_append_only');
    expect(APPEND_ONLY).toContain('BEFORE UPDATE OR DELETE ON "TransportTollReviewDecision"');
  });

  /**
   * Cung bai hoc voi `transport-run-checkpoint-storage.spec.ts`: *"khong ai `DELETE` bang moc ca,
   * ho `DELETE` cai bang cha"*. Mot trigger chi-ghi-them ngoi canh mot khoa ngoai `CASCADE` la mot
   * trigger khong bao gio chay.
   */
  it('lich su quyet dinh KHONG bi xoa lan tu ung vien', () => {
    expect(APPEND_ONLY).toContain('"TransportTollReviewDecision_candidateId_fkey"');
    expect(APPEND_ONLY).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });

  /**
   * Ban nap la DANH TINH cua nguon: `@@unique([provider, sourceDigest])` la ca phep chong nap
   * trung. Sua `sourceDigest` bang mot lenh `UPDATE` se lam mot tep da nap nap duoc lan nua duoi
   * mot danh tinh khac.
   */
  it('ban nap nguon khong sua duoc va khong xoa duoc', () => {
    expect(APPEND_ONLY).toContain('transport_toll_import_append_only');
    expect(APPEND_ONLY).toContain('BEFORE UPDATE OR DELETE ON "TransportTollImport"');
  });

  /* ================================================================== *
   * NHUNG RANG BUOC CUA LANE J MA `schema.prisma` KHONG NOI DUOC
   * ================================================================== */

  /**
   * MOT XE nhan chi tra tu nhieu nhat MOT tai khoan tai mot thoi diem.
   *
   * Unique MOT PHAN (`WHERE "effectiveTo" IS NULL`) — Prisma khong co cu phap cho no, nen no chi
   * ton tai o SQL tho. Day la thu bien "nhap nhang thi fail closed" tu mot phep kiem o tang ung
   * dung thanh mot bao dam that su khi hai lenh ghi chay cung luc.
   */
  it('mot xe chi co MOT lien ket dang mo', () => {
    expect(INGESTION).toContain('TransportTollAccountVehicleLink_activeVehicle_key');
    expect(INGESTION).toContain('WHERE "effectiveTo" IS NULL');
  });

  it('ky hieu luc khong duoc nguoc dau duoi', () => {
    expect(INGESTION).toContain('TransportTollAccountVehicleLink_period_order');
  });

  /** Chong nap trung: cung nha cung cap + cung dau van tay byte = mot ban nap. */
  it('mot nguon chi nap duoc mot lan cho moi nha cung cap', () => {
    expect(INGESTION).toContain('TransportTollImport_provider_sourceDigest_key');
  });

  it('so tien giao dich bi chan trong khoang cua `money()`', () => {
    expect(INGESTION).toContain('TransportTollTransactionCandidate_amount_range');
  });

  it('hinh dang ket qua phan tich bi ep o tang CSDL', () => {
    expect(INGESTION).toContain('TransportTollTransactionCandidate_parse_shape');
  });
});
