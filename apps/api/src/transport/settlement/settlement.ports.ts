import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { FuelRepository } from '../fuel/fuel.repository.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * BA CUA SO tu `transport-settlement` nhin ra ngoai. Ca ba deu CHI DOC.
 *
 * ===========================================================================
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`). Cach re nhat de tuan thu la ky luat, va ky
 * luat khong song sot qua sau lan sua cua sau nguoi. Cach dat la CAU TRUC: settlement khong duoc
 * tiem `TripRepository`/`CostingRepository`/`FuelRepository` o tang service, no duoc tiem ba cong
 * duoi day, va khong cong nao co mot ham ghi.
 *
 * ===========================================================================
 * VI SAO `SettlementTripFacts` GIAU HON `TripFacts` CUA COSTING — va vi sao dieu do an toan.
 *
 * `TransportCoreFacts` cua `TX-03` va `TransportFuelCoreFacts` cua `TX-04` deu CO Y bo
 * `freightAmount`: mang doanh thu vao pham vi cua chung se lam mot khung nhin gia thanh hay phieu
 * dau vo tinh lo gia cuoc ra be mat lai xe (`INV-09`).
 *
 * `TX-05` thi NGUOC LAI: doanh thu chinh la thu no ghi nhan. Cong no khach hang CHINH LA
 * `freightAmount`, va bien truc tiep khong tinh duoc neu thieu no. Bo no ra khoi cong nay se buoc
 * service phai lay so tien tu mot duong khac — va duong do se te hon.
 *
 * `INV-09` van duoc giu, nhung o mot ranh gioi KHAC: `TX-05` khong co be mat lai xe nao. Moi
 * controller cua no nam sau guard van hanh (Giam doc/Ke toan), va khong mot kieu tra ve nao cua no
 * di vao `DriverTripView`. Ranh gioi la EXPERIENCE, khong phai kieu du lieu — va do la ranh gioi
 * dung cho mot mien ma doanh thu la noi dung chinh.
 */

export interface SettlementTripFacts {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly customerId: string | null;
  readonly carrierPartnerId: string | null;
  readonly referrerPartnerId: string | null;
  /** Gia cuoc thu khach. `null` = CHUA NHAP, khac han `0`. */
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

export abstract class SettlementCoreFacts {
  abstract findTrip(tripId: string): Promise<SettlementTripFacts | null>;
  abstract listTrips(): Promise<SettlementTripFacts[]>;
}

interface TripRow {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly customerId: string | null;
  readonly carrierPartnerId: string | null;
  readonly referrerPartnerId: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

const toTripFacts = (trip: TripRow): SettlementTripFacts => ({
  id: trip.id,
  code: trip.code,
  kind: trip.kind,
  status: trip.status,
  businessDate: trip.businessDate,
  customerId: trip.customerId,
  carrierPartnerId: trip.carrierPartnerId,
  referrerPartnerId: trip.referrerPartnerId,
  freightAmount: trip.freightAmount,
  currencyCode: trip.currencyCode,
  originLabel: trip.originLabel,
  destinationLabel: trip.destinationLabel,
});

@Injectable()
export class SettlementCoreFactsAdapter extends SettlementCoreFacts {
  constructor(private readonly trips: TripRepository) {
    super();
  }

  async findTrip(tripId: string): Promise<SettlementTripFacts | null> {
    const trip = await this.trips.find(tripId);
    return trip ? toTripFacts(trip) : null;
  }

  async listTrips(): Promise<SettlementTripFacts[]> {
    const trips = await this.trips.list();
    return trips.map(toTripFacts);
  }
}

/**
 * CHI PHI TRUC TIEP cua mot chuyen, doc tu `TX-03` — CHI DOC, va di qua tang UNG DUNG cua no.
 *
 * Tiem `CostingReadService` chu khong `CostingRepository`, cung ly le voi `FuelCostingPort` cua
 * `TX-04`: tang ung dung la noi giu moi luat cua T3. Doc thang tu kho se bo qua chung, va bien
 * truc tiep se tinh tren mot con so khong ai bao dam.
 */
export abstract class SettlementCostingFacts {
  /** Tong chi phi truc tiep da ghi cho chuyen. `0` khi chua co dong nao. */
  abstract directCostOf(tripId: string): Promise<number>;
}

@Injectable()
export class SettlementCostingFactsAdapter extends SettlementCostingFacts {
  constructor(private readonly costing: CostingReadService) {
    super();
  }

  async directCostOf(tripId: string): Promise<number> {
    const breakdown = await this.costing.tripCostBreakdown(tripId);
    return breakdown.directCost;
  }
}

/**
 * BAN GIAO cua `TX-04` — HOP THU DI ma T5 doc de tao cong no cay xang.
 *
 * `schema.prisma` noi ro dieu nay o `TransportFuelSettlementHandoff`: *"T4 KHONG ghi bang cua T5 —
 * bang nay thuoc `transport-fuel` va la mot HOP THU DI: T5 se doc no de tao `PayableDocument`."*
 *
 * Nen chieu phu thuoc la T5 -> T4, MOT chieu, va CHI DOC. T4 khong biet T5 ton tai, va khong mot
 * dong nao cua T4 doi trong ban nay.
 *
 * `handoffId` la id cua MOT BAN SUA DOI, khong phai cua ky doi soat. Do la thu cho phep mot lan
 * dong lai co sua so lieu (T4R §2) di sang T5 thanh mot chung tu dieu chinh, thay vi bi nuot mat.
 */
export interface FuelHandoffFacts {
  readonly handoffId: string;
  readonly reconciliationId: string;
  readonly revision: number;
  readonly supersedesId: string | null;
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly acceptedAmount: number;
  readonly currencyCode: string;
  readonly acceptedLineCount: number;
  readonly acceptedLineIds: readonly string[];
}

export abstract class FuelSettlementSource {
  /** Ban giao GAN NHAT cua mot ky doi soat. `null` khi ky chua dong lan nao. */
  abstract latestHandoff(reconciliationId: string): Promise<FuelHandoffFacts | null>;
  /** CA chuoi ban sua doi, theo thu tu `revision` tang dan. */
  abstract handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]>;
}

interface HandoffRow {
  readonly id: string;
  readonly reconciliationId: string;
  readonly revision: number;
  readonly supersedesId: string | null;
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly acceptedAmount: number;
  readonly currencyCode: string;
  readonly acceptedLineCount: number;
  readonly acceptedLineIds: readonly string[];
}

const toHandoffFacts = (handoff: HandoffRow): FuelHandoffFacts => ({
  handoffId: handoff.id,
  reconciliationId: handoff.reconciliationId,
  revision: handoff.revision,
  supersedesId: handoff.supersedesId,
  supplierId: handoff.supplierId,
  periodStart: handoff.periodStart,
  periodEnd: handoff.periodEnd,
  acceptedAmount: handoff.acceptedAmount,
  currencyCode: handoff.currencyCode,
  acceptedLineCount: handoff.acceptedLineCount,
  acceptedLineIds: handoff.acceptedLineIds,
});

@Injectable()
export class FuelSettlementSourceAdapter extends FuelSettlementSource {
  constructor(private readonly fuel: FuelRepository) {
    super();
  }

  async latestHandoff(reconciliationId: string): Promise<FuelHandoffFacts | null> {
    const handoff = await this.fuel.findHandoff(reconciliationId);
    return handoff ? toHandoffFacts(handoff) : null;
  }

  async handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
    const revisions = await this.fuel.listHandoffRevisions(reconciliationId);
    return revisions.map(toHandoffFacts);
  }
}
