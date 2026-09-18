import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * PROOF-040 — bam vi tri la mot CAPABILITY RIENG, va cong "can-biet" nam o QUYEN chu khong o
 * loi khuyen.
 */
describe('composition cua transport-proof — PROOF-040', () => {
  it('den cung `transport-proof`', () => {
    const names = controllerNames(['transport-core', 'transport-proof']);
    expect(names).toContain('DriverTrackingController');
    expect(names).toContain('TrackingController');
    expect(names).toContain('DriverProofController');
    expect(names).toContain('ProofReviewController');
    expect(names).toContain('TelematicsIngressController');
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    const names = controllerNames(['transport-core']);
    expect(names).not.toContain('DriverTrackingController');
    expect(names).not.toContain('TrackingController');
    expect(names).not.toContain('DriverProofController');
    expect(names).not.toContain('ProofReviewController');
    // Mot khach van tai KHONG bam vi tri cung khong nhap vi tri tu phan cung: mo san mot duong ghi
    // vao so bang chung cho ho la mo mot be mat khong ai dung.
    expect(names).not.toContain('TelematicsIngressController');
  });

  it('KHONG co mat o mot khach khong dung van tai', () => {
    const names = controllerNames(['knowledge']);
    expect(names).not.toContain('TrackingController');
  });
});

/**
 * PROOF-041 — CONG CAN-BIET cua lich su vi tri.
 *
 * Bai duoi day la ban dich sang ma cua mot cau trong #235: *"raw location history chi role co
 * quyen moi xem"*. Neu ai do sau nay go `transport.location.history.read` khoi `ACCOUNTING_DENIED`
 * de "cho ke toan doi soat cho tien", bai nay do — va do la mot lua chon phai duoc noi ra thanh
 * loi, khong phai mot dong bi xoa trong mot PR ve viec khac.
 */
describe('Cong can-biet cua lich su vi tri — PROOF-041', () => {
  it('ke toan doc duoc TOM TAT', () => {
    expect(actionsForRole('ACCOUNTING')).toContain('transport.tracking.read');
  });

  it('ke toan KHONG doc duoc duong di tho', () => {
    expect(actionsForRole('ACCOUNTING')).not.toContain('transport.location.history.read');
  });

  it('ADMIN doc duoc ca hai', () => {
    expect(actionsForRole('ADMIN')).toContain('transport.tracking.read');
    expect(actionsForRole('ADMIN')).toContain('transport.location.history.read');
  });

  it('lai xe (cho giu tam `SALE`) KHONG cham vao duong van hanh nao', () => {
    const sale = actionsForRole('SALE');
    expect(sale).toContain('transport.driver.self.tracking.start');
    expect(sale).toContain('transport.driver.self.tracking.report');
    expect(sale).toContain('transport.driver.self.tracking.stop');
    expect(sale).not.toContain('transport.tracking.read');
    expect(sale).not.toContain('transport.location.history.read');
    expect(sale).not.toContain('transport.geofence.manage');
  });

  it('MANAGER van khong duoc cap gi — quy uoc cu, khong doi', () => {
    expect(actionsForRole('MANAGER')).toHaveLength(0);
  });
});

/**
 * PROOF-042 — CONG QUYEN cua cua nhap telematics (`#297` T4/T9).
 *
 * Bo bai nay la ban dich sang ma cua mot cau trong `#297`: nguon vi tri thu hai phai DOC LAP voi
 * chiec dien thoai. Doc lap khong phai mot tinh chat cua ma nguon — no la mot tinh chat cua BANG
 * PHAN QUYEN. Neu lai xe ghi duoc vao duong nay thi hai chuoi toa do lai den tu cung mot may, va
 * ca `SOURCE_FALLBACK` lan phep doi chieu cheo deu tro thanh lo.
 */
describe('Cong quyen cua cua nhap telematics — PROOF-042', () => {
  const INGEST = 'transport.telematics.observation.ingest';

  it('lai xe (cho giu tam `SALE`) KHONG ghi duoc vao nguon thu hai', () => {
    // Neu bai nay do vi ai do "gop cho tien" vao pham vi lai xe, thi cai mat khong phai mot ma
    // quyen — cai mat la ly do ton tai cua ca nguon telematics.
    expect(actionsForRole('SALE')).not.toContain(INGEST);
  });

  it('ke toan DOC duoc suc khoe vi tri nhung KHONG ghi duoc mot ban dinh vi nao', () => {
    expect(actionsForRole('ACCOUNTING')).toContain('transport.tracking.read');
    // Nguoi DUYET tien khong duoc viet ra can cu chung minh chuyen ma ho sap duyet.
    expect(actionsForRole('ACCOUNTING')).not.toContain(INGEST);
  });

  it('ADMIN ghi duoc — neu khong thi khong ai cam duoc mot dau noi vao', () => {
    expect(actionsForRole('ADMIN')).toContain(INGEST);
  });

  it('MANAGER van khong duoc cap gi', () => {
    expect(actionsForRole('MANAGER')).not.toContain(INGEST);
  });
});
