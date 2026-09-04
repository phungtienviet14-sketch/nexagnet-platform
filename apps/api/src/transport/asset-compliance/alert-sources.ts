import { Injectable } from '@nestjs/common';
import { CostingReadService } from '../costing/costing-read.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { FuelRepository } from '../fuel/fuel.repository.js';

/**
 * HAI CONG TUY CHON ma bang canh bao gom chung doc them.
 *
 * TUY CHON la diem quan trong nhat cua tep nay. `transport-asset-compliance` phu thuoc DUY NHAT
 * `transport-core` (T1 §10.1) — mot khach bat bao duong/giay to ma tat costing va fuel la mot cau
 * hinh HOP LE, va bang canh bao van phai chay. Nen hai cong duoi day KHONG duoc tiem bat buoc:
 * `OperationalAlertsService` nhan chung qua `@Optional()`, va khi thieu thi phat ra
 * `unavailableSources` thay vi tra ve mot bang ngan hon trong im lang.
 *
 * Adapter nam O DAY chu khong o `fuel/` hay `costing/`, cung ly le voi `transport-core-facts.port.ts`
 * cua T3: day la nhu cau CUA T6, va hai capability kia khong duoc phai biet ai dang doc chung.
 *
 * CA HAI CHI DOC. Khong mot ham ghi nao, nen mot lan lo tay ghi nguoc vao so quy lai xe tu bang
 * canh bao se khong bien dich duoc — va do dung la duong ma `GD-12` cam.
 */

/** Mot phieu do dau dang bi `TX-04` danh dau can kiem tra (`INV-06`, VT-046). */
export interface AbnormalFuelFact {
  readonly fuelEntryId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  /** Mili-L/100km. `null` khi `TX-04` khong tinh duoc tieu hao. */
  readonly consumptionUnits: number | null;
  readonly reviewReasonCount: number;
}

export abstract class AlertFuelConsumptionSource {
  abstract listAbnormal(): Promise<readonly AbnormalFuelFact[]>;
}

@Injectable()
export class FuelReviewAlertAdapter extends AlertFuelConsumptionSource {
  constructor(private readonly fuel: FuelRepository) {
    super();
  }

  async listAbnormal(): Promise<readonly AbnormalFuelFact[]> {
    const entries = await this.fuel.listEntriesNeedingReview();
    return entries.map((entry) => ({
      fuelEntryId: entry.id,
      vehicleId: entry.vehicleId,
      driverId: entry.driverId,
      consumptionUnits: entry.consumptionUnits,
      reviewReasonCount: entry.reviewReasons.length,
    }));
  }
}

/** So du quy cua mot lai xe — THONG TIN, khong bao gio la mot nghia vu tien (`DA-T3-01`). */
export interface DriverFundFact {
  readonly driverId: string;
  readonly balance: number;
  readonly currencyCode: string;
}

export abstract class AlertDriverFundSource {
  abstract listBalances(): Promise<readonly DriverFundFact[]>;
}

@Injectable()
export class CostingFundAlertAdapter extends AlertDriverFundSource {
  constructor(
    private readonly costing: CostingReadService,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  async listBalances(): Promise<readonly DriverFundFact[]> {
    const drivers = await this.fleet.listDrivers();
    const statements = await Promise.all(
      drivers.map(async (driver) => this.costing.driverFundStatement(driver.id)),
    );
    return statements.map((statement) => ({
      driverId: statement.driverId,
      balance: statement.balance,
      currencyCode: statement.currencyCode,
    }));
  }
}
