import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { DriverPayslipsController } from './driver-payslips.controller.js';
import type { DriverPayslipComponentView, DriverPayslipView } from './driver-payslip.view.js';
import { InMemoryWorkforceRepository } from './in-memory-workforce.repository.js';
import { WorkforceReadService } from './workforce-read.service.js';
import {
  WorkforceCoreFacts,
  type DriverPeriodWork,
  type WorkforceDriverFacts,
} from './workforce.ports.js';
import { WorkforceService } from './workforce.service.js';
import type { PayrollPolicySnapshot, Payslip } from './workforce.types.js';

/**
 * `#168 B8` — BE MAT LAI XE cho phieu luong.
 *
 * Kho trong bo nho + mot `WorkforceCoreFacts` gia, va phieu duoc sinh ra bang CHINH
 * `WorkforceService` chu khong bang cach nhoi tay vao kho: mot fixture nhoi tay se chung minh duoc
 * moi thu ke ca nhung to hop trang thai ma may trang thai khong bao gio tao ra.
 *
 * Nhung gi bo nay KHONG chung minh (giao dich, trigger phieu da chot, khoa ngoai) nam o
 * `transport-workforce.int.spec.ts` tren Postgres 16 that, voi HAI lai xe va trang thai tron.
 */

const POLICY: PayrollPolicySnapshot = {
  baseSalaryVnd: 6_000_000,
  perTripVnd: 250_000,
  perKmVnd: 1_200,
  fuelSavingBonusVndPerLiter: 8_000,
};

const DRIVER_A = 'drv-a';
const DRIVER_B = 'drv-b';
const USER_A = 'user-lai-xe-a';
const USER_B = 'user-lai-xe-b';
/** Co phien dang nhap, nhung khong noi voi ho so lai xe nao — vd nhan vien van phong. */
const USER_KHONG_NOI = 'user-van-phong';

class FakeCore extends WorkforceCoreFacts {
  readonly bindings = new Map<string, string>([
    [USER_A, DRIVER_A],
    [USER_B, DRIVER_B],
  ]);

  async listActiveDriverIds(): Promise<string[]> {
    return [DRIVER_A, DRIVER_B];
  }

  async workByDriver(): Promise<readonly DriverPeriodWork[]> {
    return [
      { driverId: DRIVER_A, tripCount: 8, distanceKm: 2_400 },
      { driverId: DRIVER_B, tripCount: 5, distanceKm: 1_500 },
    ];
  }

  async findDriverByAuthUserId(authUserId: string): Promise<WorkforceDriverFacts | null> {
    const driverId = this.bindings.get(authUserId);
    return driverId ? { id: driverId, fullName: `Lai xe ${driverId}` } : null;
  }
}

const requestOf = (authUserId: string): AuthenticatedRequest =>
  ({ authUser: { id: authUserId, role: 'SALE' } }) as unknown as AuthenticatedRequest;

interface Fixture {
  readonly controller: DriverPayslipsController;
  /** Ky 1 cua lai xe A: DA TRA, va co mot phieu bo sung DA DUYET tro ve no. */
  readonly a1: Payslip;
  readonly a1Supplement: Payslip;
  /** Ky 2 cua lai xe A: DA DAO — ban goc mang `REVERSED`, ban dao mang `APPROVED`. */
  readonly a2: Payslip;
  readonly a2Reversal: Payslip;
  /** Ky 3 cua lai xe A: con `DRAFT` — day la phieu quy tac cong bo phai giu lai. */
  readonly a3Draft: Payslip;
  /** Mot phieu CO THAT cua lai xe B, DA DUYET — de phep thu "ma cua nguoi khac" khong rong. */
  readonly b1: Payslip;
}

async function buildFixture(): Promise<Fixture> {
  const repository = new InMemoryWorkforceRepository();
  const core = new FakeCore();
  const service = new WorkforceService(repository, core, POLICY);
  const controller = new DriverPayslipsController(new WorkforceReadService(repository, core));

  const runFor = async (label: string, startDate: string, endDate: string) => {
    const period = await service.openPeriod({ label, startDate, endDate, createdBy: 'kt' });
    const outcome = await service.runPayroll({ periodId: period.id, runBy: 'kt' });
    if (outcome.kind !== 'RECORDED') throw new Error(`mong doi RECORDED, nhan ${outcome.kind}`);
    const of = (driverId: string): Payslip => {
      const payslip = outcome.payslips.find((entry) => entry.driverId === driverId);
      if (!payslip) throw new Error(`khong sinh phieu cho ${driverId}`);
      return payslip;
    };
    return { a: of(DRIVER_A), b: of(DRIVER_B) };
  };

  const ky1 = await runFor('Thang 1/2027', '2027-01-01', '2027-01-31');
  const ky2 = await runFor('Thang 2/2027', '2027-02-01', '2027-02-28');
  const ky3 = await runFor('Thang 3/2027', '2027-03-01', '2027-03-31');

  await service.approvePayslip(ky1.a.id, 'kt');
  const a1 = await service.payPayslip(ky1.a.id, 'kt');
  const supplementDraft = await service.issueCorrection({
    payslipId: a1.id,
    kind: 'SUPPLEMENTAL',
    reason: 'Bu cong tac phi thieu cua ky 1',
    actor: 'kt',
    components: [
      { kind: 'EARNING', label: 'Bu cong tac phi', amount: 500_000, recordedBy: 'kt', note: null },
    ],
  });
  const a1Supplement = await service.approvePayslip(supplementDraft.id, 'kt');

  const a2 = await service.approvePayslip(ky2.a.id, 'kt');
  const a2Reversal = await service.issueCorrection({
    payslipId: a2.id,
    kind: 'REVERSAL',
    reason: 'Tinh nham so km cua ky 2',
    actor: 'kt',
  });

  const b1 = await service.approvePayslip(ky1.b.id, 'kt');

  return { controller, a1, a1Supplement, a2, a2Reversal, a3Draft: ky3.a, b1 };
}

/** Bat mot loi ra thanh DU LIEU de so sanh duoc nguyen ven, thay vi chi hoi "co nem khong". */
async function rejectionOf(run: () => Promise<unknown>): Promise<{ name: string; body: unknown }> {
  try {
    await run();
  } catch (error) {
    return {
      name: (error as Error).constructor.name,
      body: (error as NotFoundException).getResponse(),
    };
  }
  throw new Error('mong doi mot loi tu choi, nhung loi goi da thanh cong');
}

describe('#168 B8 — be mat lai xe cho phieu luong', () => {
  let fixture: Fixture;
  const listOf = (authUserId: string) => fixture.controller.list(requestOf(authUserId));
  const getOf = (authUserId: string, id: string) =>
    fixture.controller.get(requestOf(authUserId), id);

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  it('lai xe thay DUNG lich su da cong bo cua chinh minh', async () => {
    const views = await listOf(USER_A);
    expect(new Set(views.map((view) => view.id))).toEqual(
      new Set([fixture.a1.id, fixture.a1Supplement.id, fixture.a2.id, fixture.a2Reversal.id]),
    );
  });

  /**
   * QUY TAC CONG BO — nguon cua khach khong cho phep cong bo luong TAM TINH cho lai xe.
   *
   * Do hai chieu: phieu `DRAFT` khong co trong danh sach, VA khong mot khung nhin nao mang trang
   * thai `DRAFT`. Chi kiem chieu thu nhat thi mot lan sua sau nay co the tra phieu nhap ra duoi mot
   * ma khac ma bai test van xanh.
   */
  it('phieu `DRAFT` KHONG ra toi be mat lai xe', async () => {
    const views = await listOf(USER_A);
    expect(views.map((view) => view.id)).not.toContain(fixture.a3Draft.id);
    expect(fixture.a3Draft.status).toBe('DRAFT');
    for (const view of views) expect(view.status, view.id).not.toBe('DRAFT');
  });

  it('phieu DA DUYET va phieu DA TRA cua chinh minh doc duoc tung ban', async () => {
    const paid = await getOf(USER_A, fixture.a1.id);
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).not.toBeNull();

    const approved = await getOf(USER_A, fixture.a1Supplement.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.kind).toBe('SUPPLEMENTAL');
  });

  /**
   * CHUOI SUA phai DOC DUOC, khong chi phai CO MAT.
   *
   * Mot phieu dao la mot dong am bang dung so tien cua ban goc. Neu `correctsId` bi cat di "cho an
   * toan", lai xe se thay mot khoan tru khong giai thich duoc — va do dung la cach mot con so DUNG
   * tro thanh mot cuoc tranh cai. Nen phep thu la: ma tro ve phai tro toi mot phieu MA CHINH HO
   * cung nhin thay.
   */
  it('chuoi bo sung / dao van doc duoc: ma tro ve luon nam trong tam nhin cua chinh lai xe', async () => {
    const views = await listOf(USER_A);
    const visible = new Set(views.map((view) => view.id));

    const supplement = views.find((view) => view.id === fixture.a1Supplement.id);
    const reversal = views.find((view) => view.id === fixture.a2Reversal.id);
    const reversed = views.find((view) => view.id === fixture.a2.id);

    expect(supplement?.correctsId).toBe(fixture.a1.id);
    expect(reversal?.correctsId).toBe(fixture.a2.id);
    expect(reversed?.status).toBe('REVERSED');
    for (const view of views) {
      if (view.correctsId !== null) expect(visible.has(view.correctsId), view.id).toBe(true);
      if (view.correctsId !== null) expect(view.correctionReason, view.id).not.toBeNull();
    }
  });

  it('lai xe B chi thay phieu cua B', async () => {
    const views = await listOf(USER_B);
    expect(views.map((view) => view.id)).toEqual([fixture.b1.id]);
  });
});

describe('#168 B8 — quyen so huu KHONG duoc lo ra su ton tai cua phieu nguoi khac', () => {
  let fixture: Fixture;
  const getOf = (authUserId: string, id: string) =>
    fixture.controller.get(requestOf(authUserId), id);

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  /**
   * PHEP THU THAT: khong phai "co tu choi khong", ma la "BA CAU TRA LOI CO GIONG HET NHAU KHONG".
   *
   * Neu ma cua nguoi khac ra 403 con ma bia ra 404, thi mot vong lap go ma se do duoc ma nao CO
   * THAT trong he thong — du khong doc duoc mot dong noi dung nao. `#168 B8` cam dung dieu do, nen
   * phep so sanh o day la so sanh NGUYEN VEN ca lop ngoai le lan than phan hoi.
   */
  it('ma cua nguoi khac, ma khong ton tai va phieu nhap cua chinh minh tra CUNG mot cau', async () => {
    const cuaNguoiKhac = await rejectionOf(() => getOf(USER_A, fixture.b1.id));
    const khongTonTai = await rejectionOf(() => getOf(USER_A, 'phieu-khong-bao-gio-ton-tai'));
    const nhapCuaChinhMinh = await rejectionOf(() => getOf(USER_A, fixture.a3Draft.id));

    expect(cuaNguoiKhac).toEqual(khongTonTai);
    expect(cuaNguoiKhac).toEqual(nhapCuaChinhMinh);
    expect(cuaNguoiKhac.name).toBe('NotFoundException');
    expect(cuaNguoiKhac.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      reason: 'SELF_PAYSLIP_NOT_VISIBLE',
    });
  });

  /** Phieu cua A cung khong doc duoc tu phien cua B — phep cat quyen di ca hai chieu. */
  it('doi chieu nguoc lai: phieu cua A khong doc duoc bang phien cua B', async () => {
    await expect(getOf(USER_B, fixture.a1.id)).rejects.toThrow(NotFoundException);
  });

  /**
   * TAI KHOAN CHUA NOI HO SO LAI XE — 403, va cau tra loi KHONG doi theo ma duoc hoi.
   *
   * `denied` chu khong `notFound`: cau nay noi ve chinh nguoi dang goi, khong noi gi ve phieu
   * luong. Va vi phep doi phien -> lai xe chay TRUOC moi lan doc kho, mot tai khoan chua noi ho so
   * nhan cung mot cau tra loi voi MOI ma — tuc khong co gi de do.
   */
  it('tai khoan chua noi ho so lai xe bi tu choi TAT DINH, khong theo ma duoc hoi', async () => {
    const maCoThat = await rejectionOf(() => getOf(USER_KHONG_NOI, fixture.a1.id));
    const maBiaRa = await rejectionOf(() => getOf(USER_KHONG_NOI, 'phieu-khong-bao-gio-ton-tai'));

    expect(maCoThat).toEqual(maBiaRa);
    expect(maCoThat.name).toBe('ForbiddenException');
    expect(maCoThat.body).toMatchObject({
      statusCode: 403,
      reason: 'SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING',
    });
    await expect(fixture.controller.list(requestOf(USER_KHONG_NOI))).rejects.toThrow(
      ForbiddenException,
    );
  });

  /**
   * KHONG CO PHIEN thi khong co "cua chinh toi".
   *
   * `requireAuthUserId` nem thay vi roi ve mot mac dinh im lang — mot mac dinh o day se mo toan bo
   * lich su luong cho bat ky ai o che do khong-phien.
   *
   * Nem DONG BO, truoc ca khi mot Promise duoc tao ra: tuc phep kiem phien chay TRUOC moi lan doc
   * kho, dung nhu tren cac be mat lai xe da co (`DriverFuelController`, `DriverTripsController`).
   */
  it('khong co phien dang nhap thi ca hai route deu tu choi truoc khi doc kho', () => {
    const khongPhien = {} as AuthenticatedRequest;
    expect(() => fixture.controller.list(khongPhien)).toThrow(UnauthorizedException);
    expect(() => fixture.controller.get(khongPhien, fixture.a1.id)).toThrow(UnauthorizedException);
  });
});

describe('#168 B8 — khung nhin lai xe KHONG mang du lieu van hanh', () => {
  let fixture: Fixture;
  let views: readonly DriverPayslipView[];
  /** Ban goc DA TRA cua lai xe A — phieu day du nhat: co ky, co cac dong, co ca hai moc thoi gian. */
  let daTra: DriverPayslipView;
  let dongDauTien: DriverPayslipComponentView;

  beforeAll(async () => {
    fixture = await buildFixture();
    views = await fixture.controller.list(requestOf(USER_A));

    const found = views.find((entry) => entry.id === fixture.a1.id);
    if (!found) throw new Error('fixture hong: khong thay phieu da tra cua lai xe A');
    daTra = found;
    const [component] = daTra.components;
    if (!component) throw new Error('fixture hong: phieu khong co dong nao');
    dongDauTien = component;
  });

  /**
   * BO KHOA DUOC CHOT, khong chi "khong chua truong xau".
   *
   * Mot bai chi kiem vang mat se van xanh sau ngay ai do them `runId` vao khung nhin. Chot ca bo
   * khoa co nghia la moi lan THEM mot truong deu phai di qua day — va luc do nguoi them phai doc
   * lai khoi chu thich cua `driver-payslip.view.ts` de biet vi sao bon danh tinh kia vang mat.
   */
  it('phieu mang dung 16 khoa da chot', () => {
    expect(Object.keys(daTra).sort()).toEqual(
      [
        'approvedAt',
        'components',
        'correctionReason',
        'correctsId',
        'createdAt',
        'currencyCode',
        'distanceKm',
        'grossEarnings',
        'id',
        'kind',
        'netAmount',
        'paidAt',
        'period',
        'status',
        'totalDeductions',
        'tripCount',
      ].sort(),
    );
    expect(Object.keys(daTra.period).sort()).toEqual(['endDate', 'id', 'label', 'startDate']);
    expect(Object.keys(dongDauTien).sort()).toEqual(
      ['amount', 'kind', 'label', 'note', 'quantity', 'source', 'unitAmount'].sort(),
    );
  });

  /**
   * BON DANH TINH NGUOI VAN HANH — `#168 B8` §3 goi ten tung cai.
   *
   * Kiem tren CHUOI JSON chu khong tren khoa cap mot: mot truong lot vao `components[]` hay vao
   * `period` se khong bi bat neu chi duyet khoa ngoai cung.
   */
  it('khong mang `runBy`, `approvedBy`, `paidBy` hay `recordedBy`', () => {
    const serialised = JSON.stringify(views);
    for (const leak of ['runBy', 'approvedBy', 'paidBy', 'recordedBy']) {
      expect(serialised, leak).not.toContain(leak);
    }
  });

  /**
   * HOP DONG PHU DINH CO SAN cua `/transport/me/*` (`INV-09`) van dung sau khi B8 them mot route.
   *
   * `runId` va `driverId` di kem: cai dau la ma nhom cua mot lan chay (no noi phieu nay nam cung lo
   * voi phieu cua dong nghiep), cai sau thi lai xe da biet — ca hai chi lam be mat rong ra.
   */
  it('khong mang cuoc, doanh thu, bien, hay ma noi bo cua lan chay', () => {
    const serialised = JSON.stringify(views);
    for (const leak of [
      'freight',
      'revenue',
      'margin',
      'runId',
      'driverId',
      'driverFundBalanceSnapshot',
    ]) {
      expect(serialised, leak).not.toContain(leak);
    }
  });

  /** Con SO TIEN thi phai co du — bo khung nhin khong duoc "an toan" den muc vo dung. */
  it('van mang du con so de lai xe doi chieu duoc bang luong', () => {
    expect(daTra.grossEarnings).toBeGreaterThan(0);
    expect(daTra.netAmount).toBe(daTra.grossEarnings - daTra.totalDeductions);
    expect(daTra.currencyCode).toBe('VND');
    expect(daTra.tripCount).toBe(8);
    expect(daTra.distanceKm).toBe(2_400);
    expect(daTra.components.length).toBeGreaterThan(0);
    expect(daTra.period.label).toBe('Thang 1/2027');
    expect(daTra.period.startDate).toBe('2027-01-01');
    expect(daTra.period.endDate).toBe('2027-01-31');
  });
});
