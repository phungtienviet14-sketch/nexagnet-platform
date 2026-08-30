import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_CURRENCY } from '../money.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COSTING_DECISIONS } from './costing-decisions.js';
import { requireDriverFacts, requireTripFacts } from './costing-guards.js';
import { CostingRepository } from './costing.repository.js';
import type { DriverFundStatement, TripCostBreakdown } from './costing.types.js';
import { TransportCoreFacts } from './transport-core-facts.port.js';

/**
 * KHUNG NHIN cua `TX-03` — duong DOC, tach khoi duong GHI.
 *
 * T1 §4 xep `Reporting` la READ MODEL khong so huu gi. Tach service nay ra lam dieu do thanh mot su
 * that doc duoc trong cay thu muc thay vi mot cau trong tai lieu: o day KHONG co mot loi goi ghi
 * nao, nen khong ai vo tinh dat mot buoc ghi vao mot ham ten la "xem".
 *
 * HAI CON SO KHONG BAO GIO GAP NHAU trong tep nay: so du quy va gia thanh chuyen la hai khung nhin
 * rieng, khong co mot ham nao tra ca hai trong mot tong (`INV-23`, T1 §9.2).
 *
 * VA KHONG MOT LOI GOI GHI NAO — ke ca `ensureAccount()`, von rat de lot vao day cho tien. Mot lan
 * `GET` ma tao ra mot hang la mot tac dung phu khong ai doc ten ham ma doan duoc.
 */
@Injectable()
export class CostingReadService {
  constructor(
    private readonly ledger: CostingRepository,
    private readonly core: TransportCoreFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * SO DU + LICH SU cua mot lai xe.
   *
   * So du duoc CONG RA tu so cai moi lan doc (`INV-01`), khong doc tu mot cot nao — vi khong co cot
   * nao. Xem `costing.types.ts` ve vi sao `DriverFundAccount` khong co truong `balance`.
   */
  async driverFundStatement(driverId: string): Promise<DriverFundStatement> {
    await requireDriverFacts(this.core, driverId);

    // KHONG `ensureAccount()` o day: xem chu thich cua `DriverFundStatement`. Mot lai xe chua co
    // giao dich nao thi chua co so quy, va mot lan `GET` khong duoc tao ra no.
    const account = await this.ledger.findAccountByDriver(driverId);
    if (!account) {
      return { account: null, driverId, balance: 0, currencyCode: TRANSPORT_CURRENCY, entries: [] };
    }

    const [entries, sum] = await Promise.all([
      this.ledger.listEntries(account.id),
      this.ledger.sumSignedAmounts(account.id),
    ]);
    return {
      account,
      driverId,
      balance: sum.total,
      currencyCode: account.currencyCode,
      entries,
    };
  }

  /**
   * SO QUY CUA CHINH TOI — be mat lai xe.
   *
   * Danh tinh chi den tu PHIEN, khong bao gio tu mot tham so `:driverId` tren duong dan. Do la cung
   * cau truc ma `DriverTripsController` dung o T2, va la ly do mot lai xe khong doc duoc so quy cua
   * nguoi khac bang cach doi mot id tren URL — cat hanh dong thoi thi khong du, vi hai lai xe khac
   * nhau van mang cung mot vai.
   */
  async selfFundStatement(authUserId: string): Promise<DriverFundStatement> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver.self_fund_scope',
        outcome: 'denied',
        reason: 'SELF_FUND_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_FUND_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }

    const statement = await this.driverFundStatement(driver.id);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver.self_fund_scope',
      outcome: 'allowed',
      reason: 'SELF_FUND_SCOPE_GRANTED',
      detail: { driverId: driver.id, entryCount: statement.entries.length },
    });
    return statement;
  }

  /**
   * GIA THANH TRUC TIEP cua mot chuyen = tong cac dong CO DAU (khoan chi duong, but toan dao am).
   *
   * KHONG mang doanh thu. Do khong phai su tu che: cong gia cuoc vao day se tao mot duong ro doanh
   * thu THU HAI, va `INV-09` se phai duoc giu bang ky luat o hai cho thay vi bang kieu du lieu o
   * mot cho. Bien truc tiep cua chuyen (T1 `TRIP-001`) duoc ghep o tang bao cao, tu hai nguon.
   */
  async tripCostBreakdown(tripId: string): Promise<TripCostBreakdown> {
    await requireTripFacts(this.core, tripId);
    const expenses = await this.ledger.listExpenses(tripId);
    return {
      tripId,
      currencyCode: expenses[0]?.currencyCode ?? TRANSPORT_CURRENCY,
      directCost: expenses.reduce((total, expense) => total + expense.signedAmount, 0),
      expenses,
    };
  }
}
