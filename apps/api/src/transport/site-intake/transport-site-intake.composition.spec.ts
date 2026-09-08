import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * CP-050 — nhan viec tai dia diem A la mot CAPABILITY RIENG, va no den/di tron ven.
 *
 * Quyet dinh kien truc #6: mot khach dieu xe tu van phong khong duoc thua huong mot nut `Tao
 * chuyen` tren dien thoai lai xe. Voi ho do la mot lo hong quy trinh, khong phai mot tien ich.
 */
describe('composition cua transport-site-intake — CP-050', () => {
  it('den cung `transport-site-intake`', () => {
    const names = controllerNames(['transport-core', 'transport-proof', 'transport-site-intake']);
    expect(names).toContain('DriverSiteIntakeController');
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).not.toContain('DriverSiteIntakeController');
  });

  /**
   * Bat bam vi tri KHONG tu no keo theo duong lai xe tu tao chuyen. Chieu nguoc lai thi CO — xem
   * `tenant.schema.ts`: khong co hang rao thi khong con gi de DE NGHI.
   */
  it('bat bam vi tri khong tu no mo duong tu tao chuyen', () => {
    const names = controllerNames(['transport-core', 'transport-proof']);
    expect(names).toContain('DriverTrackingController');
    expect(names).not.toContain('DriverSiteIntakeController');
  });

  /**
   * DIA DIEM VAN HANH thi NGUOC LAI — no la mot mat cua ho so phap nhan, nen no den cung
   * `transport-core`. Mot khach khai kho cua khach hang minh ma khong bat bam vi tri va khong cho
   * lai xe tu tao chuyen la mot cau hinh hop le.
   */
  it('danh muc dia diem den cung `transport-core`, khong cung capability nhan dang', () => {
    expect(controllerNames(['transport-core'])).toContain('CounterpartySitesController');
  });

  it('KHONG co mat o mot khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('DriverSiteIntakeController');
  });
});

/**
 * CP-051 — HAI BE MAT, VA DUONG TU TAO CHUYEN CHI THUOC BE MAT LAI XE.
 *
 * Neu mot ngay ai do cap hai ma nay cho vai van hanh de "tien tao ho", bai nay do — va do la mot
 * lua chon phai duoc noi ra thanh loi, khong phai mot dong them vao trong mot PR ve viec khac.
 */
describe('Hai be mat cua nhan viec tai A — CP-051', () => {
  it('lai xe co CA HAI ma pham vi cua chinh minh', () => {
    const sale = actionsForRole('SALE');
    expect(sale).toContain('transport.driver.self.site_intake.propose');
    expect(sale).toContain('transport.driver.self.site_intake.confirm');
  });

  /**
   * Van hanh KHONG co hai ma nay, va do la mot phat bieu ve pham vi chu khong ve long tin: ca hai
   * deu doc `Driver.authUserId` cua CHINH NGUOI DANG DANG NHAP. Mot nguoi dieu hanh goi chung se
   * chi nhan `SITE_INTAKE_DRIVER_BINDING_MISSING` — nen cap chung cho vai van hanh la cap mot thu
   * khong dung duoc, va bang phan quyen se noi sai ve nang luc cua ho.
   *
   * Duong tao vong chay cua van hanh da co san va van la duong dung: `transport.run.manage`.
   */
  it.each(['ADMIN', 'ACCOUNTING', 'MANAGER'] as const)(
    'vai %s khong mang ma pham vi lai xe cua nhan viec tai A',
    (role) => {
      const actions = actionsForRole(role);
      expect(actions).not.toContain('transport.driver.self.site_intake.propose');
      expect(actions).not.toContain('transport.driver.self.site_intake.confirm');
    },
  );

  /**
   * Danh muc dia diem KHONG di qua be mat lai xe. Lai xe hoi "toi dang o dau" va nhan ve mot danh
   * sach BI CHAN theo vi tri cua chinh ho; ho khong doc duoc danh sach kho cua toan bo khach hang.
   */
  it('lai xe khong doc duoc danh muc dia diem', () => {
    const sale = actionsForRole('SALE');
    expect(sale).not.toContain('transport.counterparty.read');
    expect(sale).not.toContain('transport.counterparty.manage');
  });
});
