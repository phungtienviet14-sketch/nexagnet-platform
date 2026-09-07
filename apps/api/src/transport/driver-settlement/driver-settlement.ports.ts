import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { CostingService } from '../costing/costing.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { WorkforceRepository } from '../workforce/workforce.repository.js';
import type { PostedPayslipFact } from './wage-credit.js';

/**
 * BA CUA SO tu `TX-07b` nhin sang cac mien khac.
 *
 * ===========================================================================
 * HAI trong ba cua so nay CHI DOC. Cai thu ba — `DriverSettlementFundPort` — la cho DUY NHAT
 * trong ca tranche co mot lenh GHI sang so cai cua mot capability khac, va no la mot ngoai le
 * CO TEN chu khong phai mot cho ro ri.
 *
 * Vi sao ngoai le do bat buoc phai co: so du quy AM nghia la lai xe dang bo tien tui. Khi cong ty
 * tra lai, lai xe khong con bo tien nua, nen so du PHAI ve. Neu lan chi chi duoc ghi o bang chung
 * tu chi thi so quy vinh vien noi rang cong ty con no — va lan doi soat sau se tra mot lan nua.
 *
 * Cach giu ranh gioi: lenh ghi do KHONG duoc viet o day. No la `CostingService.postReimbursement`,
 * mot lenh cua CHINH chu so cai; cong nay chi goi. `TX-07b` khong bao gio cham vao
 * `CostingRepository`.
 */

/** HO SO LAI XE toi thieu. CO Y NGHEO — khong mang so GPLX, han GPLX hay trang thai nhan su. */
export interface SettlementDriverFacts {
  readonly id: string;
  readonly fullName: string;
}

export abstract class DriverSettlementCoreFacts {
  abstract findDriver(driverId: string): Promise<SettlementDriverFacts | null>;
  /** PHIEN -> HO SO LAI XE (`#168 B8`). `null` khi tai khoan chua duoc noi voi ho so nao. */
  abstract findDriverByAuthUserId(authUserId: string): Promise<SettlementDriverFacts | null>;
  abstract listActiveDriverIds(): Promise<readonly string[]>;
}

@Injectable()
export class DriverSettlementCoreFactsAdapter extends DriverSettlementCoreFacts {
  constructor(private readonly fleet: FleetRepository) {
    super();
  }

  async findDriver(driverId: string): Promise<SettlementDriverFacts | null> {
    const driver = await this.fleet.findDriver(driverId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<SettlementDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async listActiveDriverIds(): Promise<readonly string[]> {
    const drivers = await this.fleet.listDrivers();
    return drivers.filter((driver) => driver.status === 'ACTIVE').map((driver) => driver.id);
  }
}

/**
 * PHIEU LUONG DA CHOT cua mot lai xe, kem ky sinh ra chung.
 *
 * KHONG mang thanh phan luong: `TX-07b` chi can `netAmount` va nguon goc ky. Keo ca
 * `PayslipComponent[]` sang day se lam mot khung nhin quyet toan vo tinh bay tung dong luong ra
 * mot be mat khac — dung dieu ma `workforce.ports.ts` da can than tranh o chieu nguoc lai.
 */
export abstract class DriverSettlementPayrollFacts {
  abstract postedPayslipsOf(driverId: string): Promise<readonly PostedPayslipFact[]>;
}

@Injectable()
export class DriverSettlementPayrollFactsAdapter extends DriverSettlementPayrollFacts {
  constructor(private readonly workforce: WorkforceRepository) {
    super();
  }

  /**
   * Ghep phieu -> lan chay -> ky.
   *
   * Bo dem `runs`/`periods` khong phai toi uu som: mot lai xe co mot phieu moi thang, va tat ca
   * chung thuong thuoc vai lan chay. Khong co bo dem thi cung mot ky bi doc lai muoi hai lan cho
   * moi lan mo bang quyet toan.
   */
  async postedPayslipsOf(driverId: string): Promise<readonly PostedPayslipFact[]> {
    const details = await this.workforce.listPayslipsByDriver(driverId);
    const runs = new Map<string, Awaited<ReturnType<WorkforceRepository['findRun']>>>();
    const periods = new Map<string, Awaited<ReturnType<WorkforceRepository['findPeriod']>>>();
    const facts: PostedPayslipFact[] = [];

    for (const detail of details) {
      const runId = detail.payslip.runId;
      if (!runs.has(runId)) runs.set(runId, await this.workforce.findRun(runId));
      const run = runs.get(runId);
      if (!run) continue;

      if (!periods.has(run.periodId)) {
        periods.set(run.periodId, await this.workforce.findPeriod(run.periodId));
      }
      const period = periods.get(run.periodId);
      if (!period) continue;

      facts.push({
        payslipId: detail.payslip.id,
        periodId: period.id,
        periodLabel: period.label,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        runId: run.id,
        kind: detail.payslip.kind,
        status: detail.payslip.status,
        netAmount: detail.payslip.netAmount,
        currencyCode: detail.payslip.currencyCode,
      });
    }

    return facts;
  }
}

/** MOT but toan hoan ung — chi ba truong ma `TX-07b` thuc su can. */
export interface ReimbursementEntryFacts {
  readonly id: string;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
}

export interface PostReimbursementInput {
  readonly driverId: string;
  /** DO LON, khong am. Dau do so cai quyet (`REQUIRED_SIGN.REIMBURSEMENT = +1`). */
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly correlationKey: string;
  readonly note: string | null;
}

/**
 * CONG SO QUY — mot phep doc, hai lenh ghi.
 *
 * `@Optional()` o `DriverSettlementService`: `transport-costing` la phu thuoc khai bao cua
 * `transport-workforce`, nen thuc te no luon co mat. Nhung phu thuoc do ton tai vi phieu luong
 * HIEN THI so du (VT-062), va mot ngay no co the doi. Neu cong nay vang mat thi duong rut LUONG
 * van chay binh thuong — no khong doc mot dong nao cua so quy — va chi duong HOAN UNG bi tu choi
 * voi ma `CASHOUT_FUND_UNAVAILABLE`.
 */
export abstract class DriverSettlementFundPort {
  abstract balanceOf(driverId: string): Promise<number>;
  abstract postReimbursement(
    input: PostReimbursementInput,
    actor: string,
  ): Promise<{ readonly entry: ReimbursementEntryFacts; readonly replayed: boolean }>;
  abstract reverseReimbursement(
    entryId: string,
    reason: string,
    actor: string,
  ): Promise<ReimbursementEntryFacts>;
}

const toEntryFacts = (entry: {
  id: string;
  signedAmount: number;
  businessDate: string;
}): ReimbursementEntryFacts => ({
  id: entry.id,
  signedAmount: entry.signedAmount,
  businessDate: entry.businessDate,
});

@Injectable()
export class DriverSettlementFundPortAdapter extends DriverSettlementFundPort {
  constructor(
    private readonly costing: CostingService,
    private readonly costingRead: CostingReadService,
  ) {
    super();
  }

  async balanceOf(driverId: string): Promise<number> {
    const statement = await this.costingRead.driverFundStatement(driverId);
    return statement.balance;
  }

  async postReimbursement(
    input: PostReimbursementInput,
    actor: string,
  ): Promise<{ entry: ReimbursementEntryFacts; replayed: boolean }> {
    const posted = await this.costing.postReimbursement(
      {
        driverId: input.driverId,
        amount: input.amount,
        businessDate: input.businessDate,
        correlationKey: input.correlationKey,
        note: input.note,
      },
      actor,
    );
    return { entry: toEntryFacts(posted.entry), replayed: posted.replayed };
  }

  async reverseReimbursement(
    entryId: string,
    reason: string,
    actor: string,
  ): Promise<ReimbursementEntryFacts> {
    const posted = await this.costing.reverseFundEntry(entryId, reason, actor);
    if (!posted.entry) {
      throw new Error(`So quy khong tra ve but toan dao cua ${entryId}`);
    }
    return toEntryFacts(posted.entry);
  }
}
