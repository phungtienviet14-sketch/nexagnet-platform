import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CostingService } from '../costing/costing.service.js';
import type { ExpenseFundingSource } from '../costing/driver-fund-ledger.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * HAI CUA SO DUY NHAT tu `transport-fuel` nhin RA NGOAI — mot doc, mot ghi.
 *
 * ===========================================================================
 * CUA SO 1 — `TransportFuelCoreFacts`: nhin sang `transport-core`, CHI DOC.
 *
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`). Cach re nhat de tuan thu la ky luat, va ky
 * luat khong song sot qua sau lan sua cua sau nguoi. Cach dat la CAU TRUC: fuel khong duoc tiem
 * `TripRepository`, no duoc tiem cong nay, va cong nay KHONG CO mot ham ghi nao. Mot lan lo tay goi
 * `trips.setStatus(...)` tu fuel se khong bien dich duoc.
 *
 * `FuelTripFacts` co y NGHEO — bon truong, khong co `freightAmount`. Tra ve ca `Trip` se mang doanh
 * thu vao pham vi cua fuel, va tu do khong con gi ngan mot khung nhin phieu dau vo tinh lo gia cuoc
 * ra be mat lai xe (`INV-09`).
 *
 * ===========================================================================
 * CUA SO 2 — `FuelCostingPort`: ghi sang `TX-03`, QUA HOP DONG UNG DUNG.
 *
 * Issue #86 doi dung dieu nay: *"Do not write TX-03 tables directly from Fuel repository; use the
 * public Costing contract/event/application boundary."*
 *
 * Nen adapter duoi day tiem `CostingService` — tang UNG DUNG cua T3, noi giu MOI luat cua no: dau
 * but toan, cong `INV-22` (ky quy dong bang), cong `INV-04`, cong `DA-T3-04` (lai xe phai tung
 * chay chuyen), va tinh chong ghi trung theo `correlationKey`. Neu fuel ghi thang vao
 * `CostingRepository`, tat ca nhung cong do bien mat va T4 se lang le tro thanh mot duong ghi so
 * cai thu hai KHONG co luat — dung kieu hong ma `INV-20` sinh ra de chan.
 *
 * Cong nay cung la cho `transport-fuel` co the tro thanh mot su kien that (`FuelEntryVerified` ->
 * `TX-03`, T1 §8.2) ma khong doi mot dong nao cua service: hom nay la mot loi goi dong bo, mai la
 * mot lan phat su kien, va ca hai deu nam sau cung mot ten ham.
 */

export interface FuelTripFacts {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
}

export interface FuelVehicleFacts {
  readonly id: string;
  readonly registrationPlate: string;
  /** Dung de tra dinh muc tieu hao cua goi khach (VT-046). */
  readonly vehicleClass: string;
}

export interface FuelDriverFacts {
  readonly id: string;
  readonly fullName: string;
}

export abstract class TransportFuelCoreFacts {
  abstract findTrip(tripId: string): Promise<FuelTripFacts | null>;
  abstract findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null>;
  /**
   * MOI xe, de dung bang tra `bien so -> id` luc nhap bang ke.
   *
   * Doc CA DANH SACH thay vi tra tung bien so mot: mot bang ke co hang tram dong, va tra tung dong
   * se la N lan cham DB cho mot viec co the lam bang mot. Doi xe cua khach nay ~10 xe (T1 §1), nen
   * ca danh sach la mot con so nho co gioi han that.
   */
  abstract listVehicles(): Promise<FuelVehicleFacts[]>;
  abstract findDriver(driverId: string): Promise<FuelDriverFacts | null>;
  /** Cau noi user dang nhap -> ho so lai xe, cho be mat "phieu dau cua chinh toi". */
  abstract findDriverByAuthUserId(authUserId: string): Promise<FuelDriverFacts | null>;
  /**
   * Lai xe nay CO TUNG duoc phan cong vao chuyen do khong — ke ca ban phan cong DA DONG LAI.
   *
   * "Tung", khong phai "dang": `GD-06` giu lich su phan cong dung de mot nguoi bi thay ca van chiu
   * trach nhiem cho phan chuyen ho da chay. Doc "dang" se lam moi phieu dau cua nguoi lai dau tien
   * khong nop duoc ngay khi nguoi thu hai nhan xe.
   */
  abstract wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean>;
  /** Nhu tren cho XE. Mot phieu dau ghi cho xe khong chay chuyen do la mot lan go nham. */
  abstract wasVehicleEverAssignedToTrip(tripId: string, vehicleId: string): Promise<boolean>;
}

/**
 * Hien thuc DUY NHAT cua cong doc, qua kho cua `transport-core`.
 *
 * Dat trong thu muc fuel chu khong o `trips/`: day la nhu cau CUA FUEL, va `transport-core` khong
 * duoc phai biet ai dang doc no de con dung duoc mot minh (T1 §10.1).
 */
@Injectable()
export class TransportFuelCoreFactsAdapter extends TransportFuelCoreFacts {
  constructor(
    private readonly trips: TripRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  async findTrip(tripId: string): Promise<FuelTripFacts | null> {
    const trip = await this.trips.find(tripId);
    if (!trip) return null;
    return { id: trip.id, code: trip.code, kind: trip.kind, status: trip.status };
  }

  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    const vehicle = await this.fleet.findVehicle(vehicleId);
    if (!vehicle) return null;
    return {
      id: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      vehicleClass: vehicle.vehicleClass,
    };
  }

  async listVehicles(): Promise<FuelVehicleFacts[]> {
    const vehicles = await this.fleet.listVehicles();
    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      vehicleClass: vehicle.vehicleClass,
    }));
  }

  async findDriver(driverId: string): Promise<FuelDriverFacts | null> {
    const driver = await this.fleet.findDriver(driverId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<FuelDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    const history = await this.trips.listAssignments(tripId);
    return history.some((assignment) => assignment.driverId === driverId);
  }

  async wasVehicleEverAssignedToTrip(tripId: string, vehicleId: string): Promise<boolean> {
    const history = await this.trips.listAssignments(tripId);
    return history.some((assignment) => assignment.vehicleId === vehicleId);
  }
}

/* ------------------------------------------------------------------ *
 * CUA SO 2 — ghi sang `TX-03`
 * ------------------------------------------------------------------ */

/**
 * MA NHOM CHI PHI cua nhien lieu.
 *
 * Mot HANG SO cua mien, khong phai cau hinh khach: neu moi khach dat mot ma khac nhau thi khong bao
 * cao nao cong duoc "chi phi dau" ngang qua hai khach, va chinh T4 cung khong biet nhin cot nao.
 *
 * LUU Y VAN HANH: mot goi khach CO khai `policies.transportCosting.expenseCategories` PHAI co ma
 * nay trong danh sach, neu khong lan duyet phieu dau dau tien se bi `EXPENSE_CATEGORY_UNKNOWN` tu
 * choi. Danh sach rong (mac dinh) thi khong gioi han gi, nen duong chay pho bien khong vuong.
 */
export const FUEL_EXPENSE_CATEGORY_CODE = 'FUEL';

export interface FuelCostPostingCommand {
  readonly tripId: string;
  /** BAT BUOC khi lai xe tra tien mat (`DRIVER_FUND`); `null` khi ky so no cay xang. */
  readonly driverId: string | null;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  readonly evidenceLocator: string | null;
  readonly note: string | null;
  /** Khoa TAT DINH suy tu id phieu — xem `fuelCostCorrelationKey()`. */
  readonly correlationKey: string;
}

export abstract class FuelCostingPort {
  /** Tra ve id cua dong gia thanh o `TX-03`. Goi lai cung khoa KHONG sinh dong thu hai. */
  abstract postFuelCost(command: FuelCostPostingCommand, actor: string): Promise<string>;
}

/**
 * KHOA CHONG GHI TRUNG suy TAT DINH tu id phieu.
 *
 * Day la nua thu nhat cua "chi phi dau vao gia thanh chuyen DUNG MOT LAN": goi `postFuelCost` hai
 * lan cho cung mot phieu se gap dung khoa nay o `CostingService`, va lan thu hai tra lai dong da
 * ghi thay vi ghi them. Nua thu hai la cot `TransportFuelEntry.costExpenseId` UNIQUE — mot khoan
 * chi khong the la chan gia thanh cua hai phieu.
 *
 * Hai lop nghe thua, nhung chung chan hai kieu hong khac nhau: khoa nay chan mot lan GOI LAP, con
 * unique kia chan mot lan GAN SAI. Bo lop nao cung de lai mot duong dem hai lan tien dau — khoan
 * chiem 35-45% gia thanh chuyen theo nguon khach.
 */
export const fuelCostCorrelationKey = (fuelEntryId: string): string => `fuel:${fuelEntryId}`;

/**
 * Hien thuc DUY NHAT cua cong ghi — qua `CostingService`, KHONG qua `CostingRepository`.
 *
 * Doc lai khoi chu thich dau tep truoc khi doi dong `constructor` nay: chinh viec tiem service chu
 * khong tiem repository la dieu Issue #86 yeu cau, va la thu giu cho moi cong cua T3 con hieu luc
 * tren duong tien cua T4.
 */
@Injectable()
export class CostingFuelExpenseAdapter extends FuelCostingPort {
  constructor(private readonly costing: CostingService) {
    super();
  }

  async postFuelCost(command: FuelCostPostingCommand, actor: string): Promise<string> {
    const posted = await this.costing.recordTripExpense(
      {
        tripId: command.tripId,
        categoryCode: FUEL_EXPENSE_CATEGORY_CODE,
        amount: command.amount,
        fundedBy: command.fundedBy,
        driverId: command.driverId,
        businessDate: command.businessDate,
        evidenceLocator: command.evidenceLocator,
        note: command.note,
        correlationKey: command.correlationKey,
      },
      actor,
    );

    const expenseId = posted.expense?.id;
    if (!expenseId) {
      // `recordTripExpense` luon tra ve chan gia thanh — `TripExpense.tripId` la `NOT NULL` va moi
      // duong goi o day deu co `tripId`. Neu den duoc dong nay thi hop dong cua `TX-03` da doi, va
      // im lang bo qua se de lai mot phieu "da duyet" khong co chi phi nao trong gia thanh chuyen.
      throw new Error('CostingService khong tra ve dong gia thanh cho phieu dau');
    }
    return expenseId;
  }
}
