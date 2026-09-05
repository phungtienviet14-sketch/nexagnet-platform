import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  toDriverPayslipPeriodView,
  toDriverPayslipView,
  type DriverPayslipPeriodView,
  type DriverPayslipView,
} from './driver-payslip.view.js';
import { isPublishableToDriver } from './payslip-lifecycle.js';
import { TRANSPORT_WORKFORCE_DECISIONS } from './workforce-decisions.js';
import { WorkforceCoreFacts, type WorkforceDriverFacts } from './workforce.ports.js';
import { WorkforceRepository } from './workforce.repository.js';
import type { PayrollPeriod, PayrollRun, PayslipDetail } from './workforce.types.js';

/**
 * Duong DOC cua `transport-workforce`.
 *
 * KHONG CO MOT LOI GOI GHI NAO — cung quy uoc voi `fuel-read.service.ts` va
 * `asset-compliance-read.service.ts`. `NO_REPORTING_AS_BUSINESS_TRUTH` (T1 §16) duoc giu bang cach
 * tep nay khong tiem thu gi ghi duoc.
 *
 * ---------------------------------------------------------------------------
 * BE MAT LAI XE O DAY DUOC CHOT BANG QUYEN SO HUU, KHONG BANG VAI — `#168 B8`.
 *
 * `SALE` la cho giu tam cho vai lai xe (`GD-22`), nen HAI lai xe khac nhau mang CUNG mot vai. Cat
 * hanh dong theo vai vi vay khong du: danh tinh den tu PHIEN, doi ra `driverId`, roi moi ban ghi
 * tra ve deu phai thuoc chinh `driverId` do. Cung khuon `FuelReadService` da dung tu T4.
 */
@Injectable()
export class WorkforceReadService {
  constructor(
    private readonly repository: WorkforceRepository,
    private readonly core: WorkforceCoreFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ------------------------- Be mat van hanh ------------------------- */

  async listPeriods(): Promise<PayrollPeriod[]> {
    return this.repository.listPeriods();
  }

  async listRuns(periodId: string): Promise<PayrollRun[]> {
    return this.repository.listRuns(periodId);
  }

  async listPayslips(runId: string): Promise<PayslipDetail[]> {
    return this.repository.listPayslips(runId);
  }

  /**
   * MOI phieu cua mot lai xe — ke ca phieu bo sung va phieu dao.
   *
   * Tra ve CA chuoi sua chu khong chi ban goc: mot ky luong da duoc sua doc dung chi khi doc du ca
   * ba loai, va lay tong bang cach cong `netAmount` cua toan bo chuoi.
   *
   * DAY LA DUONG VAN HANH, nen no KHONG loc `DRAFT` va KHONG kiem quyen so huu: nguoi goi la Ke
   * toan dang mo ho so mot lai xe. Duong cua chinh lai xe la `listMyPayslips()` ben duoi.
   */
  async listPayslipsByDriver(driverId: string): Promise<PayslipDetail[]> {
    return this.repository.listPayslipsByDriver(driverId);
  }

  async payslipDetail(id: string): Promise<PayslipDetail> {
    const detail = await this.repository.findPayslip(id);
    if (!detail) {
      throw TransportDomainError.notFound('PAYSLIP_NOT_FOUND', `Khong tim thay phieu luong ${id}`);
    }
    return detail;
  }

  /* -------------------------- Be mat lai xe -------------------------- */

  /**
   * PHIEU LUONG CUA CHINH TOI — `#168 B8`.
   *
   * Danh tinh den tu phien, khong bao gio tu mot `:driverId` tren duong dan. Dung `listPayslipsByDriver`
   * cua chinh tang nay lam nguon su that, roi ap THEM hai thu ma be mat van hanh khong co:
   *
   *   1. quy tac cong bo — phieu `DRAFT` bi giu lai (`toDriverPayslipView` tra `null`);
   *   2. khung nhin lai xe — `DriverPayslipView`, khong phai `PayslipDetail`.
   *
   * `SELF_PAYSLIP_DRAFT_WITHHELD` duoc phat khi co phieu bi giu lai. Do la bang chung DOC DUOC o
   * runtime rang quy tac cong bo dang chay, chu khong chi rang chua ai bat qua tang no khong chay.
   */
  async listMyPayslips(authUserId: string): Promise<DriverPayslipView[]> {
    const driver = await this.requireDriverBinding(authUserId);
    const details = await this.repository.listPayslipsByDriver(driver.id);
    const periods = await this.periodsOfRuns(details);

    const views = details
      .map((detail) => toDriverPayslipView(detail, this.periodOf(periods, detail)))
      .filter((view): view is DriverPayslipView => view !== null);

    const withheld = details.length - views.length;
    if (withheld > 0) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'driver.self_payslip_scope',
        outcome: 'denied',
        reason: 'SELF_PAYSLIP_DRAFT_WITHHELD',
        detail: { driverId: driver.id, withheldCount: withheld },
      });
    }
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'driver.self_payslip_scope',
      outcome: 'allowed',
      reason: 'SELF_PAYSLIP_SCOPE_GRANTED',
      detail: { driverId: driver.id, payslipCount: views.length },
    });
    return views;
  }

  /**
   * MOT phieu cua chinh toi.
   *
   * BA TINH HUONG, MOT CAU TRA LOI — `#168 B8` doi dung dieu nay:
   *
   *   · ma khong ton tai;
   *   · phieu cua lai xe khac;
   *   · phieu cua chinh ho nhung con `DRAFT`.
   *
   * Ca ba deu ra `SELF_PAYSLIP_NOT_VISIBLE` (404), cung mot cau chu, cung mot `reason`. Neu chung
   * khac nhau — du chi la 403 doi 404 — thi mot vong lap go ma se do duoc ma nao CO THAT trong he
   * thong, va do da la mot thong tin ve dong nghiep ma nguoi hoi khong duoc phep co. Thu duy nhat
   * PHAN BIET ba duong la trace, va trace thi khong di ra ngoai.
   *
   * PHEP DOI PHIEN -> LAI XE CHAY TRUOC. No chi phu thuoc vao chinh nguoi dang dang nhap, nen mot
   * tai khoan chua noi ho so luon nhan cung mot cau tra loi voi MOI ma — khong mot ma nao lam no
   * doi cau tra loi, tuc cung khong co gi de do.
   */
  async getMyPayslip(authUserId: string, payslipId: string): Promise<DriverPayslipView> {
    const driver = await this.requireDriverBinding(authUserId);
    const detail = await this.repository.findPayslip(payslipId);

    if (!detail) return this.notVisible(driver, payslipId, 'SELF_PAYSLIP_SCOPE_UNKNOWN_ID');
    if (detail.payslip.driverId !== driver.id) {
      return this.notVisible(driver, payslipId, 'SELF_PAYSLIP_SCOPE_NOT_OWNED');
    }
    // QUY TAC CONG BO CHAY TRUOC KHI DOC KY LUONG: khong doc them hai bang cho mot phieu se bi tu
    // choi, va cau tra loi vi vay khong the phu thuoc vao ket qua cua hai lan doc do.
    if (!isPublishableToDriver(detail.payslip.status)) {
      return this.notVisible(driver, payslipId, 'SELF_PAYSLIP_SCOPE_NOT_PUBLISHED');
    }

    const periods = await this.periodsOfRuns([detail]);
    // `null` o day khong con voi toi duoc — phep kiem tren da loai `DRAFT`. Giu lai vi day la thu
    // thu hep kieu tra ve xuong `DriverPayslipView`, va vi BAO DAM nam o `toDriverPayslipView`
    // chu khong o dong `if` ben tren: mot duong doc thu ba sau nay quen kiem thi van khong lo phieu.
    const view = toDriverPayslipView(detail, this.periodOf(periods, detail));
    if (!view) return this.notVisible(driver, payslipId, 'SELF_PAYSLIP_SCOPE_NOT_PUBLISHED');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'driver.self_payslip_scope',
      outcome: 'allowed',
      reason: 'SELF_PAYSLIP_SCOPE_GRANTED',
      detail: { driverId: driver.id, payslipId },
    });
    return view;
  }

  /**
   * CAU TRA LOI DUY NHAT cho ba duong khong-nhin-thay-duoc.
   *
   * `reason` ben trong phan biet ba duong CHO TRACE; `reason` di ra ngoai thi chi co mot. Do la ca
   * diem cua ham nay: gop ba loi goi lai mot cho de khong lan sua nao vo tinh tach chung ra.
   */
  private notVisible(
    driver: WorkforceDriverFacts,
    payslipId: string,
    reason:
      | 'SELF_PAYSLIP_SCOPE_UNKNOWN_ID'
      | 'SELF_PAYSLIP_SCOPE_NOT_OWNED'
      | 'SELF_PAYSLIP_SCOPE_NOT_PUBLISHED',
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'driver.self_payslip_scope',
      outcome: 'denied',
      reason,
      detail: { driverId: driver.id, payslipId },
    });
    throw TransportDomainError.notFound(
      'SELF_PAYSLIP_NOT_VISIBLE',
      'Khong tim thay phieu luong nao mang ma nay trong pham vi cua ban',
    );
  }

  /**
   * PHIEN -> HO SO LAI XE. Duong DUY NHAT be mat lai xe biet minh dang phuc vu ai.
   *
   * `denied` chu khong `notFound`: cau tra loi nay khong noi gi ve phieu luong ca, no noi ve chinh
   * nguoi dang goi — nen no khong the bi dung lam mot phep do su ton tai cua ban ghi nao.
   */
  private async requireDriverBinding(authUserId: string): Promise<WorkforceDriverFacts> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'driver.self_payslip_scope',
        outcome: 'denied',
        reason: 'SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }
    return driver;
  }

  /**
   * `runId` -> KY LUONG, tra ve mot bang tra theo `runId`.
   *
   * Doc theo LO chu khong tung phieu: mot lai xe co n phieu nhung thuong chi vai lan chay va vai
   * ky, nen doc tung phieu se sinh dung cai vong `N+1` ma mot man hinh lich su luong hay dinh.
   */
  private async periodsOfRuns(
    details: readonly PayslipDetail[],
  ): Promise<ReadonlyMap<string, DriverPayslipPeriodView>> {
    const runIds = [...new Set(details.map((detail) => detail.payslip.runId))];
    const runs = await Promise.all(
      runIds.map(async (id) => [id, await this.repository.findRun(id)] as const),
    );

    const periodIds = [
      ...new Set(runs.map(([, run]) => run?.periodId).filter((id) => id !== undefined)),
    ];
    const periods = new Map(
      await Promise.all(
        periodIds.map(async (id) => [id, await this.repository.findPeriod(id)] as const),
      ),
    );

    const byRun = new Map<string, DriverPayslipPeriodView>();
    for (const [runId, run] of runs) {
      const period = run ? periods.get(run.periodId) : null;
      if (period) byRun.set(runId, toDriverPayslipPeriodView(period));
    }
    return byRun;
  }

  /**
   * BAT BIEN KHOA NGOAI, doc ra thanh mot cau.
   *
   * `TransportPayslip.runId -> TransportPayrollRun.periodId -> TransportPayrollPeriod` deu la khoa
   * ngoai, nen khong tim thay ky o day la mot bat bien luu tru DA VO — khong phai mot dau vao sai.
   * Nem thay vi bo qua phieu do: bo qua se lam mot lai xe mo man hinh luong ra it phieu hon thuc te
   * ma khong mot dong log nao noi vi sao, va do la kieu su co khong ai bao cao duoc.
   */
  private periodOf(
    periods: ReadonlyMap<string, DriverPayslipPeriodView>,
    detail: PayslipDetail,
  ): DriverPayslipPeriodView {
    const period = periods.get(detail.payslip.runId);
    if (!period) {
      throw TransportDomainError.notFound(
        'PAYROLL_RUN_NOT_FOUND',
        `Phieu luong ${detail.payslip.id} tro toi lan chay ${detail.payslip.runId} khong doc duoc`,
      );
    }
    return period;
  }
}
