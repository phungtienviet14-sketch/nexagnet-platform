import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * CA-010 — nghiem thu chung tu la mot CAPABILITY RIENG, va no den/di tron ven.
 */
describe('composition cua transport-acceptance — CA-010', () => {
  it('den cung `transport-acceptance`', () => {
    const names = controllerNames(['transport-core', 'transport-acceptance']);
    expect(names).toContain('CommercialAcceptanceController');
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).not.toContain('CommercialAcceptanceController');
  });

  it('KHONG co mat o mot khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('CommercialAcceptanceController');
  });
});

/*
 * CONG TAI CHINH KHONG CO CHE DO TAT — mot khach bat `transport-settlement` ma tat
 * `transport-acceptance` phai KHONG BOOT DUOC.
 *
 * Bai do nam o `packages/tenant/src/__tests__/tenant.config.spec.ts`, khong o day, va do la co y:
 * bang phu thuoc capability la mot hang so KHONG export cua goi tenant, va quy uoc cua repo cho
 * moi luat phu thuoc la mot bai HANH VI (`loadTenantConfig()` nem) chu khong phai mot phep doc
 * hang so. Doc mot bang o day se phai noi long be mat cong khai cua goi tenant de phuc vu mot bai
 * test — va van khong chung minh duoc rang luat do THUC SU chan luc boot.
 */

/**
 * CA-012 — AI DUOC QUYET, VA AI KHONG.
 *
 * Ban dich sang ma cua ba cau trong `#268`:
 *
 *   · *"Final approval in Nexagnet may be performed by boss/ADMIN and ACCOUNTING"*;
 *   · *"Driver and unauthorized roles cannot approve"*;
 *   · *"Accounting may DECIDE acceptance but may NOT rewrite the checkpoint/evidence source"*.
 *
 * Neu ai do sau nay cap `transport.commercial_acceptance.decide` cho vai lai xe, hay cap
 * `transport.checkpoint.record` cho ke toan de "cho tien", bai nay do — va do la mot lua chon phai
 * duoc noi thanh loi, khong phai mot dong them vao trong mot PR ve viec khac.
 */
describe('Quyen nghiem thu — CA-012', () => {
  it('Giam doc doc va quyet duoc', () => {
    const admin = actionsForRole('ADMIN');
    expect(admin).toContain('transport.commercial_acceptance.read');
    expect(admin).toContain('transport.commercial_acceptance.decide');
  });

  it('Ke toan doc va quyet duoc', () => {
    const accounting = actionsForRole('ACCOUNTING');
    expect(accounting).toContain('transport.commercial_acceptance.read');
    expect(accounting).toContain('transport.commercial_acceptance.decide');
  });

  it('LAI XE khong doc duoc va khong quyet duoc — ke ca vong chay cua chinh minh', () => {
    const sale = actionsForRole('SALE');
    expect(sale).not.toContain('transport.commercial_acceptance.read');
    expect(sale).not.toContain('transport.commercial_acceptance.decide');
  });

  it('khong co bien the "cua chinh minh" nao cho nghiem thu', () => {
    // Mot ma `transport.driver.self.commercial_acceptance.*` se la mot duong de lai xe cham vao
    // chinh cai cong dang chan ho. Bai nay chan viec no duoc them vao trong im lang.
    const selfScoped = actionsForRole('SALE').filter((action) =>
      action.includes('commercial_acceptance'),
    );
    expect(selfScoped).toEqual([]);
  });

  it('MANAGER fail-closed', () => {
    expect(actionsForRole('MANAGER')).toEqual([]);
  });

  /**
   * TACH NHIEM VU — `#268` I3, va la ly do lane nay khong phai mo rong quyen cua ai.
   *
   * Ke toan QUYET duoc nghiem thu nhung KHONG sua duoc ba thu tao ra can cu cho chinh quyet dinh
   * do. Ba ma nay da nam trong `ACCOUNTING_DENIED` tu truoc `#268`; bai nay khoa chung lai o dung
   * cho ma mot nguoi doc `#268` se tim.
   */
  it('Ke toan QUYET duoc nhung KHONG sua duoc can cu dang nghiem thu', () => {
    const accounting = actionsForRole('ACCOUNTING');
    expect(accounting).toContain('transport.commercial_acceptance.decide');

    expect(accounting).not.toContain('transport.checkpoint.record');
    expect(accounting).not.toContain('transport.proof.withdraw');
    expect(accounting).not.toContain('transport.geofence.manage');

    // Va van DOC duoc chung — doi soat thi phai nhin duoc can cu.
    expect(accounting).toContain('transport.checkpoint.read');
    expect(accounting).toContain('transport.proof.read');
  });
});

/**
 * CA-013 — DUONG HTTP THUC SU LA DUONG DON, doc tu chinh ma nguon cua controller.
 *
 * Mot hang so quyen va mot bai kiem `controllers` KHONG chung minh duoc rang co mot duong HTTP nao
 * — chung chi chung minh rang mot lop duoc dang ky. `#275` K4 dat ra mot yeu cau ve DUONG DAN
 * (*"Normal boss/accounting surface should not ask them for a Run ID"*), nen bai nay doc dung cai
 * tep dinh nghia duong do.
 */
describe('Duong HTTP cua ket thuc don — CA-013', () => {
  const controller = readFileSync(
    fileURLToPath(new URL('./commercial-acceptance.controller.ts', import.meta.url)),
    'utf8',
  );
  const orders = readFileSync(
    fileURLToPath(new URL('../movement/orders.controller.ts', import.meta.url)),
    'utf8',
  );

  it('ho so va quyet dinh deu key bang orderId', () => {
    expect(controller).toContain("@Get('orders/:orderId')");
    expect(controller).toContain("@Post('orders/:orderId/decisions')");
  });

  it('KHONG con duong nao key bang runId — chu the da doi', () => {
    expect(controller).not.toMatch(/@Get\('runs\//);
    expect(controller).not.toMatch(/@Post\('runs\//);
  });

  it('quyet dinh lay danh tinh tu PHIEN, khong tu than yeu cau', () => {
    expect(controller).toContain('requireAuthUserId(request)');
    expect(controller).not.toMatch(/body\.\w*decidedBy/);
  });

  /**
   * `#275` K5 — duong CHIEU THUONG MAI phai ton tai, neu khong thi mot chuyen chua co don se bi
   * cong chan vinh vien va khong ai co cach nao mo no ra.
   */
  it('co mot duong chieu chuyen v1 sang nghia vu thuong mai', () => {
    expect(orders).toContain("@Post('projections/trip/:tripId')");
    expect(orders).toContain('projectTripOrder');
    expect(orders).toContain("@Roles('ACCOUNTING', 'ADMIN')");
  });
});
