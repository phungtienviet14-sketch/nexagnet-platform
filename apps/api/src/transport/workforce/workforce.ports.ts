import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { TripRepository } from '../trips/trip.repository.js';
import { WaitingAllowanceRepository } from '../waiting/allowance.repository.js';

/**
 * BON CUA SO tu `transport-workforce` nhin sang cac capability khac. Ca bon CHI DOC.
 *
 * Hai cai dau (`WorkforceCoreFacts`, `WorkforceCostingFacts`) la BAT BUOC — chung khop dung hai
 * phu thuoc khai o T1 §10.1. Cai thu ba (`WorkforceFuelFacts`) la TUY CHON, va do la lua chon
 * kien truc quan trong nhat cua tep nay: thuong tiet kiem dau can du lieu cua `TX-04`, nhung bat
 * `transport-fuel` thanh phu thuoc se lam mot khach chi tra luong co ban phai dung ca doi soat
 * bang ke cay xang. Nen no den qua `@Optional()`, va khi vang mat thi lan chay ghi
 * `FUEL_SAVING_UNAVAILABLE` vao `missingInputs` thay vi lang le tinh ra so khong.
 *
 * `WorkforceWaitingAllowanceFacts` (`#279` O6) den theo dung khuon do va vi dung mot ly do: phu cap
 * cho thuoc `transport-checkpoint`, va mot khach chi tra luong co ban khong phai bat ca quy trinh
 * cong/can/phieu giao de chay duoc bang luong.
 */

/** Cong viec cua mot lai xe trong mot ky — dem duoc, tat dinh. */
export interface DriverPeriodWork {
  readonly driverId: string;
  readonly tripCount: number;
  readonly distanceKm: number;
}

/**
 * HO SO LAI XE toi thieu — DU de tra loi "phien nay la ai", KHONG hon.
 *
 * Hai truong, cung hinh dang voi `FuelDriverFacts` cua `TX-04`. Tra ve ca `Driver` se mang so
 * GPLX, han GPLX va trang thai nhan su vao pham vi cua `transport-workforce` — va tu do khong con
 * gi ngan mot khung nhin phieu luong vo tinh bay chung ra be mat lai xe.
 */
export interface WorkforceDriverFacts {
  readonly id: string;
  readonly fullName: string;
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

  /**
   * PHIEN -> HO SO LAI XE — cau noi `Driver.authUserId`, `#168 B8`.
   *
   * Nam o CONG chu khong o mot `FleetRepository` duoc tiem thang: `transport-workforce` khong duoc
   * cam vao kho cua `transport-core` (T1 §4.1 luat 4), va cong nay khong co mot ham ghi nao.
   *
   * `null` khi tai khoan chua duoc noi voi ho so lai xe nao. Do la mot trang thai THAT cua du lieu
   * (mot nhan vien van phong dang nhap chang han), khong phai mot loi — nen no duoc TRA VE, va tang
   * goi quyet dinh no co nghia la tu choi hay khong.
   */
  abstract findDriverByAuthUserId(authUserId: string): Promise<WorkforceDriverFacts | null>;
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

  async findDriverByAuthUserId(authUserId: string): Promise<WorkforceDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
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

/**
 * PHU CAP CHO DA DUOC DUYET — cong THU TU, TUY CHON, va CHI DOC.
 *
 * ============================================================================================
 * CHIEU PHU THUOC DI TU LUONG SANG MOC, KHONG NGUOC LAI
 * ============================================================================================
 *
 * `transport-checkpoint` KHONG duoc biet gi ve bang luong: mot khach co cong de vao va can de can
 * van phai chay duoc ma khong bat `transport-workforce`. Nen cong nay nam o phia LUONG, `@Optional()`,
 * y het `WorkforceFuelFacts`.
 *
 * Vang mat cong ⇒ bang luong chay binh thuong, khong co dong phu cap cho nao. Do la mot cau tra loi
 * DUNG chu khong phai mot con so bi thieu: khach do khong theo doi khoang cho nguoi nhan.
 *
 * ============================================================================================
 * CONG NAY TRA VE MOT SO DA DUOC MOT NGUOI DUYET, KHONG PHAI MOT SO DUOC TINH
 * ============================================================================================
 *
 * `#279` O6: *"only approved amount enters driver earning/settlement source exactly once"*. Tong o
 * day chi cong nhung hang `APPROVED`, va so duoc cong la `approvedAmount` — con so NGUOI DUYET
 * chot, khong phai con so van phong de nghi.
 *
 * KHONG mot phep tinh nao tren thoi luong di qua day. `payroll-calculator.ts` nhan mot con so da
 * co san va cong no vao; no khong biet phien cho la gi.
 */
export abstract class WorkforceWaitingAllowanceFacts {
  /**
   * Tong khoan phu cap cho DA DUYET theo lai xe, trong mot khoang NGAY NGHIEP VU.
   *
   * `count` di kem `totalAmount` de phieu luong noi duoc *"3 lan cho"* thay vi mot con so gop
   * khong giai thich duoc. Chi tiet tung phien nam o `TransportDriverWaitingAllowance`, va bang
   * luong khong co viec gi phai cam khoa cua no.
   */
  abstract approvedAllowanceByDriver(
    startDate: BusinessDate,
    endDate: BusinessDate,
  ): Promise<ReadonlyMap<string, { readonly totalAmount: number; readonly count: number }>>;
}

/**
 * ADAPTER cua cong tren, doc tu kho phu cap cho cua `transport-checkpoint`.
 *
 * Song o day (phia LUONG) chu khong o phia moc, cung quy uoc voi `WorkforceCostingFactsAdapter`
 * ngay tren: kieu cua cong thuoc ve nguoi DUNG no, con phep dang ky provider thuoc ve capability
 * SO HUU du lieu (`app-composition.ts`, `owned('transport-checkpoint', ...)`).
 *
 * KHONG mot phep tinh nao o day. Adapter chi doi hinh dang cua mot con so da duoc mot nguoi duyet.
 */
@Injectable()
export class WorkforceWaitingAllowanceFactsAdapter extends WorkforceWaitingAllowanceFacts {
  constructor(private readonly allowances: WaitingAllowanceRepository) {
    super();
  }

  async approvedAllowanceByDriver(
    startDate: BusinessDate,
    endDate: BusinessDate,
  ): Promise<ReadonlyMap<string, { readonly totalAmount: number; readonly count: number }>> {
    const totals = await this.allowances.approvedTotalsBetween(startDate, endDate);
    return new Map(
      totals.map((row) => [row.driverId, { totalAmount: row.totalAmount, count: row.count }]),
    );
  }
}
