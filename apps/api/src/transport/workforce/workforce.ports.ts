import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * BA CUA SO tu `transport-workforce` nhin sang cac capability khac. Ca ba CHI DOC.
 *
 * Hai cai dau (`WorkforceCoreFacts`, `WorkforceCostingFacts`) la BAT BUOC — chung khop dung hai
 * phu thuoc khai o T1 §10.1. Cai thu ba (`WorkforceFuelFacts`) la TUY CHON, va do la lua chon
 * kien truc quan trong nhat cua tep nay: thuong tiet kiem dau can du lieu cua `TX-04`, nhung bat
 * `transport-fuel` thanh phu thuoc se lam mot khach chi tra luong co ban phai dung ca doi soat
 * bang ke cay xang. Nen no den qua `@Optional()`, va khi vang mat thi lan chay ghi
 * `FUEL_SAVING_UNAVAILABLE` vao `missingInputs` thay vi lang le tinh ra so khong.
 */

/** Cong viec cua mot lai xe trong mot ky — dem duoc, tat dinh. */
export interface DriverPeriodWork {
  readonly driverId: string;
  readonly tripCount: number;
  readonly distanceKm: number;
}

export abstract class WorkforceCoreFacts {
  abstract listActiveDriverIds(): Promise<string[]>;
  /**
   * So chuyen va so km cua tung lai xe trong khoang ngay nghiep vu.
   *
   * CHI dem chuyen `DELIVERED` va `RECONCILED`: mot chuyen dang chay chua hoan thanh cong viec, va
   * mot chuyen `CANCELLED` khong bao gio duoc tra cong. Dem theo `businessDate` cua chuyen chu
   * khong theo `createdAt` — `INV-25`, va do la khac biet giua mot phieu luong dung ky va mot phieu
   * cong nham chuyen cua thang truoc.
   *
   * `distanceKm` cong don tu `Trip.distanceKm`, von NULLABLE (`GD-14`): chuyen khong nhap km dong
   * gop `0`. Khong bia ra mot con so tu hieu odo o day — `GD-14` noi ro do chi la GOI Y de nguoi
   * xac nhan, va mot goi y di thang vao bang luong thi khong con ai xac nhan no nua.
   */
  abstract workByDriver(
    startDate: BusinessDate,
    endDate: BusinessDate,
  ): Promise<readonly DriverPeriodWork[]>;
}

@Injectable()
export class WorkforceCoreFactsAdapter extends WorkforceCoreFacts {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly trips: TripRepository,
  ) {
    super();
  }

  async listActiveDriverIds(): Promise<string[]> {
    const drivers = await this.fleet.listDrivers();
    return drivers.filter((driver) => driver.status === 'ACTIVE').map((driver) => driver.id);
  }

  async workByDriver(
    startDate: BusinessDate,
    endDate: BusinessDate,
  ): Promise<readonly DriverPeriodWork[]> {
    const [trips, assignments] = await Promise.all([
      this.trips.list(),
      this.trips.listActiveAssignments(),
    ]);

    const inPeriod = new Map(
      trips
        .filter(
          (trip) =>
            (trip.status === 'DELIVERED' || trip.status === 'RECONCILED') &&
            trip.businessDate >= startDate &&
            trip.businessDate <= endDate,
        )
        .map((trip) => [trip.id, trip.distanceKm ?? 0]),
    );

    const byDriver = new Map<string, { tripCount: number; distanceKm: number }>();
    for (const assignment of assignments) {
      if (assignment.driverId === null) continue;
      const distance = inPeriod.get(assignment.tripId);
      if (distance === undefined) continue;
      const current = byDriver.get(assignment.driverId) ?? { tripCount: 0, distanceKm: 0 };
      byDriver.set(assignment.driverId, {
        tripCount: current.tripCount + 1,
        distanceKm: current.distanceKm + distance,
      });
    }

    return [...byDriver.entries()].map(([driverId, work]) => ({ driverId, ...work }));
  }
}

/** So du quy lai xe — THONG TIN tren phieu luong, khong bao gio la mot khoan tru (`GD-12`). */
export abstract class WorkforceCostingFacts {
  abstract fundBalanceOf(driverId: string): Promise<number>;
}

@Injectable()
export class WorkforceCostingFactsAdapter extends WorkforceCostingFacts {
  constructor(private readonly costing: CostingReadService) {
    super();
  }

  async fundBalanceOf(driverId: string): Promise<number> {
    const statement = await this.costing.driverFundStatement(driverId);
    return statement.balance;
  }
}

/**
 * SO LIT TIET KIEM duoc so voi dinh muc, trong ky, theo lai xe.
 *
 * TUY CHON — xem ghi chu dau tep. Khong co hien thuc nao trong ban T6 nay: `TX-04` chua co mot
 * phep tong hop "lit tiet kiem theo lai xe theo ky" tat dinh, va bia mot phep tinh o day se lam
 * `transport-workforce` tu dinh nghia lai dinh muc — dung dieu ma quyen so huu capability cam.
 *
 * Ghi ten cong nay THAY VI de trong: no la cho DUY NHAT thanh phan thuong se cam vao khi `TX-04`
 * cong bo phep tong hop do, va cho den luc ay `missingInputs` noi that rang con so nay chua co.
 */
export abstract class WorkforceFuelFacts {
  abstract litersSavedByDriver(
    startDate: BusinessDate,
    endDate: BusinessDate,
  ): Promise<ReadonlyMap<string, number>>;
}
