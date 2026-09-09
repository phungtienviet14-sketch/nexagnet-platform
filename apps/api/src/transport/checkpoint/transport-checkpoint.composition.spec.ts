import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * CP-040 — moc van hanh la mot CAPABILITY RIENG, va no den/di tron ven.
 *
 * `#243` khong noi thang dieu nay, nhung Quyet dinh kien truc #6 thi co: quy trinh cong/can/phieu
 * giao la cua RIENG cong ty B. Bai duoi day la cho de dieu do khong bi lang le keo vao loi.
 */
describe('composition cua transport-checkpoint — CP-040', () => {
  it('den cung `transport-checkpoint`', () => {
    const names = controllerNames(['transport-core', 'transport-proof', 'transport-checkpoint']);
    expect(names).toContain('DriverCheckpointsController');
    expect(names).toContain('CheckpointsController');
  });

  /**
   * PHIEN CHO NGUOI NHAN (`#279` O5) den cung capability nay — khong mot `CapabilityId` moi.
   *
   * `tenant.schema.ts` da mo ta `transport-checkpoint` la *"moc gan vao VehicleRun/RunLeg, phieu
   * cong/can/giao, phien cho nguoi nhan, phu cap cho cua lai xe"*. Mot khach co cong de vao va can
   * de can thi cung la khach co khoang cho nguoi nhan; tach chung ra se bat ho khai hai co cho mot
   * quy trinh.
   */
  it('phien cho den/di CUNG moc van hanh', () => {
    const names = controllerNames(['transport-core', 'transport-proof', 'transport-checkpoint']);
    expect(names).toContain('DriverWaitingController');
    expect(names).toContain('WaitingController');
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    const names = controllerNames(['transport-core']);
    expect(names).not.toContain('DriverCheckpointsController');
    expect(names).not.toContain('CheckpointsController');
    expect(names).not.toContain('DriverWaitingController');
    expect(names).not.toContain('WaitingController');
  });

  /**
   * Bat bam vi tri KHONG keo theo moc van hanh. Chieu nguoc lai thi CO (xem `tenant.schema.ts`) —
   * mot dong thoi gian khong chung minh duoc lan den noi la mot dong thoi gian khong tra loi duoc
   * cau hoi cua `#243` F3.
   */
  it('bat bam vi tri khong tu no keo theo moc van hanh', () => {
    const names = controllerNames(['transport-core', 'transport-proof']);
    expect(names).toContain('DriverTrackingController');
    expect(names).not.toContain('DriverCheckpointsController');
  });

  it('KHONG co mat o mot khach khong dung van tai', () => {
    const names = controllerNames(['knowledge']);
    expect(names).not.toContain('CheckpointsController');
  });
});

/**
 * CP-041 — HAI BE MAT, HAI QUYEN.
 *
 * Bai dau la ban dich sang ma cua mot cau trong `#243` F7: *"Driver A cannot submit/read Driver B
 * checkpoint/doc/waiting data"*. Neu ai do sau nay cap `transport.checkpoint.record` cho vai lai
 * xe de "cho ho ghi bu moc luc mat song", bai nay do — va do la mot lua chon phai duoc noi ra
 * thanh loi, khong phai mot dong them vao trong mot PR ve viec khac.
 */
describe('Hai be mat cua moc van hanh — CP-041', () => {
  it('lai xe CHI co ma pham vi cua chinh minh', () => {
    const sale = actionsForRole('SALE');
    expect(sale).toContain('transport.driver.self.checkpoint.record');
    expect(sale).not.toContain('transport.checkpoint.record');
    expect(sale).not.toContain('transport.checkpoint.read');
  });

  /**
   * PHAN CONG NHIEM VU, khong phai su nghi ngo. F4 dat phu cap cho tren mot con so do duoc tu
   * chinh chuoi moc. Neu nguoi DUYET khoan tien do cung sua duoc can cu sinh ra no thi cong duyet
   * cua F4 chi con kiem mot con so ma chinh nguoi kiem viet ra.
   */
  it('ke toan DOC duoc dong thoi gian nhung KHONG ghi duoc moc', () => {
    const accounting = actionsForRole('ACCOUNTING');
    expect(accounting).toContain('transport.checkpoint.read');
    expect(accounting).not.toContain('transport.checkpoint.record');
  });

  /**
   * `#279` O5/O6 — cung phan cong nhiem vu, ap cho phien cho, va o day no chat hon.
   *
   * Gio DONG cua mot phien la moc tren cua khoang thoi gian ma Ke toan sap duyet tien cho. Cho
   * nguoi duyet dong duoc phien la cho ho tu chot lay con so ho sap duyet.
   */
  it('ke toan DOC duoc phien cho nhung KHONG dong duoc', () => {
    const accounting = actionsForRole('ACCOUNTING');
    expect(accounting).toContain('transport.waiting.read');
    expect(accounting).not.toContain('transport.waiting.close');
  });

  /**
   * Lai xe co DUNG MOT ma: MO. Ho dong mot phien bang cach bam `Khach da nhan hang` — tuc ghi mot
   * moc — chu khong bang mot lenh thu hai. Mot ma `.close` rieng cho lai xe se la duong ghi THU HAI
   * cho cung mot su that.
   */
  it('lai xe MO duoc phien cho nhung khong co mot ma DONG nao', () => {
    const sale = actionsForRole('SALE');
    expect(sale).toContain('transport.driver.self.waiting.start');
    expect(sale).not.toContain('transport.waiting.close');
    expect(sale).not.toContain('transport.waiting.read');
  });

  it('dieu hanh co ca hai ma van hanh', () => {
    const admin = actionsForRole('ADMIN');
    expect(admin).toContain('transport.checkpoint.read');
    expect(admin).toContain('transport.checkpoint.record');
  });
});
