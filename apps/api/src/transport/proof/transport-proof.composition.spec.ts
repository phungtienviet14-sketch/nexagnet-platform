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
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    const names = controllerNames(['transport-core']);
    expect(names).not.toContain('DriverTrackingController');
    expect(names).not.toContain('TrackingController');
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
