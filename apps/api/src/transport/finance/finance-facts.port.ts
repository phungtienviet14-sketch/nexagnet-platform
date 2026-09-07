import { Injectable } from '@nestjs/common';
import { DriverSettlementReadService } from '../driver-settlement/driver-settlement-read.service.js';
import { SettlementReadService } from '../settlement/settlement-read.service.js';
import { TripRepository } from '../trips/trip.repository.js';
import type { BusinessDate } from '../business-date.js';
import type { DirectMarginRollup } from '../settlement/direct-margin.js';
import type { SettlementFlow } from '../settlement/settlement-flows.js';
import type { DriverBalanceRow, PayableRow, ReceivableSummary } from './finance-summary.js';

/**
 * HAI CUA SO cua bang tai chinh. Ca hai CHI DOC.
 *
 * Cung khuon `analytics.ports.ts`: khong mot ham ghi nao, nen cau "bao cao khong bao gio ghi" la
 * mot dieu kien BIEN DICH chu khong phai mot loi hua trong tai lieu. Cong duoi tiem cac SERVICE
 * da duoc module `exports` (`SettlementReadService`, `DriverSettlementReadService`,
 * `TripRepository`) — khong tiem kho khong duoc export cua mien khac.
 */

export abstract class FinanceSettlementFacts {
  abstract receivable(asOf: BusinessDate): Promise<ReceivableSummary>;
  /** Hang phai tra cua MOT dong tien. `GD-15` cam mot bien the "tat ca dong tien". */
  abstract payable(flow: SettlementFlow): Promise<readonly PayableRow[]>;
  /** Bien truc tiep cong don. Mang san `fixedCostsIncluded: false` + cau cong bo. */
  abstract directMargin(): Promise<DirectMarginRollup>;
  /** Ma tien da nhin thay o cac hang phai thu — de phat hien du lieu nhieu dong tien. */
  abstract receivableCurrencies(asOf: BusinessDate): Promise<readonly string[]>;
}

@Injectable()
export class FinanceSettlementFactsAdapter extends FinanceSettlementFacts {
  constructor(
    private readonly settlement: SettlementReadService,
    private readonly trips: TripRepository,
  ) {
    super();
  }

  async receivable(asOf: BusinessDate): Promise<ReceivableSummary> {
    const report = await this.settlement.arAging(asOf);
    return { outstandingTotal: report.outstandingTotal, overdueTotal: report.overdueTotal };
  }

  async receivableCurrencies(asOf: BusinessDate): Promise<readonly string[]> {
    const report = await this.settlement.arAging(asOf);
    return report.rows.map((row) => row.currencyCode);
  }

  async payable(flow: SettlementFlow): Promise<readonly PayableRow[]> {
    const rows = await this.settlement.apByCounterparty(flow);
    return rows.map((row) => ({
      outstandingAmount: row.outstandingAmount,
      currencyCode: row.currencyCode,
    }));
  }

  /**
   * CONG DON tren MOI chuyen dang co.
   *
   * GIOI HAN da biet, ghi ra thay vi giau: `directMarginRollup` doc bien cua tung chuyen, nen day
   * la mot phep doc theo so chuyen. Mien nay chua co duong truy van theo khoang ngay
   * (`DocumentQuery` khong co truong ngay — `settlement.repository.ts:112-119`), nen mot bang
   * "bien truc tiep thang nay" chua dung duoc. Khi co duong do, doi cho nay chu khong doi hinh
   * dang du lieu: `directMarginRollup` da nhan mot danh sach `tripId` bat ky.
   */
  async directMargin(): Promise<DirectMarginRollup> {
    const trips = await this.trips.list();
    return this.settlement.directMarginRollup(trips.map((trip) => trip.id));
  }
}

/**
 * CUA SO sang `TX-07b` — HAI so cua lai xe, giu rieng.
 *
 * TUY CHON: mot khach van tai bat `transport-settlement` ma khong tinh luong van co bang tai
 * chinh, chi thieu hai o cuoi — va bang noi ra dieu do qua `unavailableSources`.
 */
export abstract class FinanceDriverBalanceFacts {
  abstract balances(): Promise<readonly DriverBalanceRow[]>;
}

@Injectable()
export class FinanceDriverBalanceFactsAdapter extends FinanceDriverBalanceFacts {
  constructor(private readonly driverSettlement: DriverSettlementReadService) {
    super();
  }

  async balances(): Promise<readonly DriverBalanceRow[]> {
    const rows = await this.driverSettlement.fleetBalances();
    return rows.map((row) => ({
      reimbursementOutstanding: row.reimbursementOutstanding,
      wageRemaining: row.wageRemaining,
    }));
  }
}
