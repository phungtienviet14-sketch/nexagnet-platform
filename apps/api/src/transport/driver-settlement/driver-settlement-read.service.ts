import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate, type BusinessDate } from '../business-date.js';
import { describeFundBalance } from '../costing/driver-fund-ledger.js';
import { TRANSPORT_CLOCK, TRANSPORT_CORE_POLICY } from '../transport-policy.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { foldAllocations, type CashoutCapacity } from './cashout-allocation.js';
import { TRANSPORT_DRIVER_SETTLEMENT_DECISIONS } from './driver-settlement-decisions.js';
import {
  DriverSettlementCoreFacts,
  DriverSettlementFundPort,
  DriverSettlementPayrollFacts,
} from './driver-settlement.ports.js';
import { DriverSettlementRepository } from './driver-settlement.repository.js';
import type {
  DriverCashoutDetail,
  DriverSettlementBalance,
  DriverSettlementSelfStatement,
  DriverSettlementStatement,
} from './driver-settlement.types.js';
import {
  WAGE_SETTLEMENT_WINDOW_DAYS,
  foldWageMonths,
  unsettledBeyondWindow,
  type WageMonth,
} from './wage-credit.js';

/**
 * DUONG DOC cua `TX-07b`.
 *
 * ===========================================================================
 * MOT PHEP TINH, MOT CHO. `snapshotOf()` la nguon cua ca ba be mat — bang ke toan, bang lai xe, va
 * CONG GHI cua `DriverSettlementService`. Tinh so du o hai cho se lam giao dien noi mot dang va
 * cong ghi tin mot dang, va lech do chi lo ra khi mot lan chi bi tu choi ma nguoi dung khong hieu
 * vi sao.
 */

/** Vat lieu tho cua mot lai xe, doc mot lan. */
export interface DriverSettlementSnapshot {
  readonly balance: DriverSettlementBalance;
  readonly months: readonly WageMonth[];
  readonly cashouts: readonly DriverCashoutDetail[];
  readonly capacity: CashoutCapacity;
}

@Injectable()
export class DriverSettlementReadService {
  constructor(
    private readonly repository: DriverSettlementRepository,
    private readonly payroll: DriverSettlementPayrollFacts,
    private readonly core: DriverSettlementCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly fund?: DriverSettlementFundPort,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * ANH CHUP mot lai xe — bon con so, cac thang, va cac lan chi.
   *
   * `reimbursementOutstanding` doc TU SO QUY, khong tu tong cac lan chi. So du quy DA phan anh moi
   * lan chi hoan ung (moi lan sinh mot but toan `REIMBURSEMENT` duong), nen tru them
   * `reimbursementCashedOut` la tru HAI LAN. Xem chu thich cua `DriverSettlementBalance`.
   */
  async snapshotOf(driverId: string): Promise<DriverSettlementSnapshot> {
    const [payslips, cashouts] = await Promise.all([
      this.payroll.postedPayslipsOf(driverId),
      this.repository.listByDriver(driverId),
    ]);

    const allocations = cashouts.flatMap((detail) => detail.allocations);
    const cashedOutByPayslip = new Map<string, number>();
    for (const allocation of allocations) {
      if (allocation.source !== 'WAGE' || allocation.payslipId === null) continue;
      cashedOutByPayslip.set(
        allocation.payslipId,
        (cashedOutByPayslip.get(allocation.payslipId) ?? 0) + allocation.amount,
      );
    }

    const months = foldWageMonths(payslips, cashedOutByPayslip);
    const wageCredited = foldAllocations(months.map((month) => month.credited));
    const wageCashedOut = foldAllocations(
      allocations.filter((allocation) => allocation.source === 'WAGE').map((row) => row.amount),
    );
    const reimbursementCashedOut = foldAllocations(
      allocations
        .filter((allocation) => allocation.source === 'REIMBURSEMENT')
        .map((row) => row.amount),
    );

    const fundBalance = this.fund ? await this.fund.balanceOf(driverId) : 0;
    const currencyCode = payslips[0]?.currencyCode ?? 'VND';

    const balance: DriverSettlementBalance = {
      driverId,
      currencyCode,
      wageCredited,
      wageCashedOut,
      wageRemaining: wageCredited - wageCashedOut,
      fundBalance,
      fundStance: describeFundBalance(fundBalance),
      reimbursementOutstanding: Math.max(0, -fundBalance),
      reimbursementCashedOut,
    };

    const wageRemainingByPayslip = new Map<string, number>();
    for (const payslip of payslips) {
      if (payslip.netAmount <= 0) continue;
      const remaining = payslip.netAmount - (cashedOutByPayslip.get(payslip.payslipId) ?? 0);
      if (remaining > 0) wageRemainingByPayslip.set(payslip.payslipId, remaining);
    }

    return {
      balance,
      months,
      cashouts,
      capacity: {
        currencyCode,
        wageRemainingByPayslip,
        wageRemainingTotal: balance.wageRemaining,
        reimbursementOutstanding: balance.reimbursementOutstanding,
      },
    };
  }

  /** BE MAT KE TOAN — them phan bo chi tiet va canh bao cua so quyet toan (`F-08`). */
  async statement(driverId: string): Promise<DriverSettlementStatement> {
    const driver = await this.core.findDriver(driverId);
    if (!driver) {
      throw TransportDomainError.notFound(
        'CASHOUT_DRIVER_NOT_FOUND',
        `Khong tim thay lai xe ${driverId}`,
      );
    }

    const snapshot = await this.snapshotOf(driverId);
    const unsettled = unsettledBeyondWindow(
      snapshot.months,
      this.today(),
      WAGE_SETTLEMENT_WINDOW_DAYS,
    );

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.wage_window',
      outcome: unsettled.length > 0 ? 'degraded' : 'allowed',
      reason:
        unsettled.length > 0 ? 'WAGE_CREDIT_UNSETTLED_BEYOND_WINDOW' : 'WAGE_CREDITS_WITHIN_WINDOW',
      detail: { driverId, periods: unsettled.length, windowDays: WAGE_SETTLEMENT_WINDOW_DAYS },
    });

    return {
      balance: snapshot.balance,
      months: snapshot.months,
      cashouts: snapshot.cashouts,
      unsettled,
      settlementWindowDays: WAGE_SETTLEMENT_WINDOW_DAYS,
    };
  }

  /**
   * BE MAT LAI XE — danh tinh den tu PHIEN, khong tu mot `:driverId` tren duong dan.
   *
   * KHONG mang `fundBalance` tho ra: mot lai xe doc "so du quy: -1.500.000" se hieu la minh dang
   * no, dung cai ma `DA-T3-01` canh bao. Con so ho nhan la `reimbursementOutstanding`, luon duong.
   */
  async selfStatement(authUserId: string): Promise<DriverSettlementSelfStatement> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
        point: 'driver_settlement.self_statement',
        outcome: 'denied',
        reason: 'SELF_DRIVER_PROFILE_MISSING',
        detail: {},
      });
      throw TransportDomainError.denied(
        'CASHOUT_SELF_DRIVER_NOT_LINKED',
        'Tai khoan nay chua duoc noi voi mot ho so lai xe',
      );
    }

    const snapshot = await this.snapshotOf(driver.id);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.self_statement',
      outcome: 'allowed',
      reason: 'SELF_SETTLEMENT_SERVED',
      detail: { driverId: driver.id, months: snapshot.months.length },
    });

    return {
      driverId: driver.id,
      driverName: driver.fullName,
      currencyCode: snapshot.balance.currencyCode,
      wageCredited: snapshot.balance.wageCredited,
      wageCashedOut: snapshot.balance.wageCashedOut,
      wageRemaining: snapshot.balance.wageRemaining,
      reimbursementOutstanding: snapshot.balance.reimbursementOutstanding,
      reimbursementCashedOut: snapshot.balance.reimbursementCashedOut,
      months: snapshot.months,
      cashouts: snapshot.cashouts,
    };
  }

  /** BANG DOI XE — mot dong so du cho moi lai xe dang lam viec. */
  async fleetBalances(): Promise<readonly DriverSettlementBalance[]> {
    const driverIds = await this.core.listActiveDriverIds();
    const balances: DriverSettlementBalance[] = [];
    for (const driverId of driverIds) {
      balances.push((await this.snapshotOf(driverId)).balance);
    }
    return balances;
  }

  private today(): BusinessDate {
    const now = this.clock ? this.clock() : new Date();
    return toBusinessDate(now, this.corePolicy.timeZone);
  }
}
