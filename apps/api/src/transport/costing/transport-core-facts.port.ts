import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * CUA SO DUY NHAT tu `transport-costing` nhin sang `transport-core`.
 *
 * T1 §4.1 luat 4: `NO_CROSS_CONTEXT_REPOSITORY_WRITE`. Cach re nhat de tuan thu la ky luat — va ky
 * luat khong song sot qua sau lan sua cua sau nguoi. Cach dat la CAU TRUC: costing khong duoc tiem
 * `TripRepository`, no duoc tiem cai cong nay, va cong nay KHONG CO mot ham ghi nao. Mot lan lo
 * tay goi `trips.setStatus(...)` tu costing se khong bien dich duoc, thay vi chay dung mot lan roi
 * de lai mot chuyen bi doi trang thai boi nguoi khong so huu no.
 *
 * `TripFacts` co y NGHEO: chi bon truong ma costing that su can de quyet dinh. Tra ve ca `Trip` se
 * mang `freightAmount` vao pham vi cua costing, va tu do khong con gi ngan mot khung nhin gia
 * thanh vo tinh lo doanh thu ra be mat lai xe (`INV-09`).
 */
export interface TripFacts {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
}

export interface DriverFacts {
  readonly id: string;
  readonly fullName: string;
}

export abstract class TransportCoreFacts {
  abstract findTrip(tripId: string): Promise<TripFacts | null>;
  abstract findDriver(driverId: string): Promise<DriverFacts | null>;
  /** Cau noi user dang nhap -> ho so lai xe, cho be mat "so quy cua chinh toi". */
  abstract findDriverByAuthUserId(authUserId: string): Promise<DriverFacts | null>;
}

/**
 * Hien thuc DUY NHAT cua cong tren, doc qua kho cua `transport-core`.
 *
 * Dat trong thu muc costing chu khong o `trips/`: day la nhu cau CUA COSTING, va `transport-core`
 * khong duoc phai biet ai dang doc no de con dung duoc mot minh (T1 §10.1).
 */
@Injectable()
export class TransportCoreFactsAdapter extends TransportCoreFacts {
  constructor(
    private readonly trips: TripRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  async findTrip(tripId: string): Promise<TripFacts | null> {
    const trip = await this.trips.find(tripId);
    if (!trip) return null;
    return { id: trip.id, code: trip.code, kind: trip.kind, status: trip.status };
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    const driver = await this.fleet.findDriver(driverId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<DriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }
}
