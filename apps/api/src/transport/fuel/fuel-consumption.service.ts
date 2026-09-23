import { Inject, Injectable } from '@nestjs/common';
import { addBusinessDays, type BusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  buildFuelConsumptionDrilldown,
  compareFuelChronology,
  type FuelConsumptionDrilldown,
} from './fuel-consumption-drilldown.js';
import type { FuelVerificationStatus } from './fuel-lifecycle.js';
import {
  consumptionNormFor,
  TRANSPORT_FUEL_POLICY,
  type TransportFuelPolicy,
} from './fuel-policy.js';
import { FUEL_INBOX_MAX_LIMIT } from './fuel.schemas.js';
import { TransportFuelCoreFacts, type FuelVehicleFacts } from './fuel.ports.js';
import { FuelRepository, type FuelEntryInboxQuery } from './fuel.repository.js';
import type { FuelEntry } from './fuel.types.js';

/**
 * TRAN DOC cua mot lan drill-down. Mot xe tai do ~1-2 lan/ngay, nen 1.000 phieu la hon mot quy.
 * Vuot tran thi tra `isTruncated: true` — khong am tham tra thieu, khong doc ca bang.
 */
export const FUEL_CONSUMPTION_MAX_ENTRIES = 1_000;

/**
 * So phieu con hieu luc doc NGUOC tu truoc ky de tim moc. Hop thu xep `businessDate DESC,
 * occurredAt DESC, id ASC`, nen phieu gan nhat nam trong trang dau; lay hon mot phieu de hai phieu
 * cung khoanh khac van duoc chon theo DUNG thu tu cua chuoi, khong theo tie-break cua hop thu.
 */
const LEAD_IN_WINDOW = 20;

/** Phieu co the lam moc truoc ky. `REJECTED` khong phai moc (xem `fuel-consumption-drilldown.ts`). */
const ANCHOR_STATUSES: readonly FuelVerificationStatus[] = ['DECLARED', 'VERIFIED'];

export interface FuelVehicleConsumptionQuery {
  readonly vehicleId: string;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
}

export interface FuelVehicleConsumption extends FuelConsumptionDrilldown {
  readonly vehicle: Pick<FuelVehicleFacts, 'id' | 'registrationPlate' | 'vehicleClass'>;
  readonly period: { readonly from: BusinessDate; readonly to: BusinessDate };
  /** `normL100km = null` = hang xe chua khai dinh muc — khong phai "dinh muc bang 0". */
  readonly norm: { readonly normL100km: number | null; readonly tolerancePercent: number };
  readonly isTruncated: boolean;
}

/**
 * DRILL-DOWN TIEU HAO theo XE / KY — duong DOC, khong mot lenh ghi (`#313`).
 *
 * Doc qua dung MOT cong cua kho — `listEntriesForInbox`, co bien, co bo loc xe + khoang ngay — chu
 * khong mo them mot truy van kho moi: hop dong cua cong do (thu tu, bien, bo loc) da duoc hai kho
 * va bo test tich hop giu san, va mot truy van thu hai se la mot cho thu hai phai giu dung dieu do.
 *
 * `bo loc trang thai = null` o ky dang xem: phieu bi tu choi VAN hien ra (nam ngoai chuoi, co ly
 * do), vi mot khoang trong khong giai thich trong chuoi km la thu lam nguoi doc nghi so lieu mat.
 */
@Injectable()
export class FuelConsumptionReadService {
  constructor(
    private readonly repository: FuelRepository,
    private readonly core: TransportFuelCoreFacts,
    @Inject(TRANSPORT_FUEL_POLICY) private readonly policy: TransportFuelPolicy,
  ) {}

  async vehicleConsumption(query: FuelVehicleConsumptionQuery): Promise<FuelVehicleConsumption> {
    const vehicle = await this.core.findVehicle(query.vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound(
        'VEHICLE_NOT_FOUND',
        `Khong tim thay xe ${query.vehicleId}`,
      );
    }

    const [period, leadIn] = await Promise.all([this.readPeriod(query), this.readLeadIn(query)]);
    const norm = {
      normL100km: consumptionNormFor(this.policy, vehicle.vehicleClass),
      tolerancePercent: this.policy.consumption.tolerancePercent,
    };

    return {
      vehicle: {
        id: vehicle.id,
        registrationPlate: vehicle.registrationPlate,
        vehicleClass: vehicle.vehicleClass,
      },
      period: { from: query.from, to: query.to },
      norm,
      ...buildFuelConsumptionDrilldown({ entries: period.entries, leadIn, ...norm }),
      isTruncated: period.isTruncated,
    };
  }

  /**
   * Doc HET ky qua nhieu trang, co tran.
   *
   * Loai trung theo `id`: giua hai trang mot phieu co the doi trang thai duyet va nhay trang. Mot
   * phieu hien HAI lan trong chuoi km se tao ra mot doan 0 km gia — te hon mot lan doc lai.
   */
  private async readPeriod(
    query: FuelVehicleConsumptionQuery,
  ): Promise<{ readonly entries: readonly FuelEntry[]; readonly isTruncated: boolean }> {
    const byId = new Map<string, FuelEntry>();
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total && byId.size < FUEL_CONSUMPTION_MAX_ENTRIES) {
      const page = await this.repository.listEntriesForInbox(
        this.inboxQuery(query.vehicleId, {
          from: query.from,
          to: query.to,
          limit: FUEL_INBOX_MAX_LIMIT,
          offset,
        }),
      );
      total = page.total;
      if (page.entries.length === 0) break;
      for (const entry of page.entries) byId.set(entry.id, entry);
      offset += page.entries.length;
    }

    const entries = [...byId.values()].sort(compareFuelChronology);
    return {
      entries: entries.slice(0, FUEL_CONSUMPTION_MAX_ENTRIES),
      isTruncated: total > FUEL_CONSUMPTION_MAX_ENTRIES,
    };
  }

  private async readLeadIn(query: FuelVehicleConsumptionQuery): Promise<FuelEntry | null> {
    const before = addBusinessDays(query.from, -1);
    const pages = await Promise.all(
      ANCHOR_STATUSES.map((verification) =>
        this.repository.listEntriesForInbox(
          this.inboxQuery(query.vehicleId, {
            verification,
            to: before,
            limit: LEAD_IN_WINDOW,
            offset: 0,
          }),
        ),
      ),
    );
    return (
      pages
        .flatMap((page) => page.entries)
        .sort(compareFuelChronology)
        .at(-1) ?? null
    );
  }

  private inboxQuery(
    vehicleId: string,
    patch: Partial<FuelEntryInboxQuery> & Pick<FuelEntryInboxQuery, 'limit' | 'offset'>,
  ): FuelEntryInboxQuery {
    return {
      verification: null,
      reconciliation: null,
      tripIds: null,
      // `#364` — tieu hao la su that cua XE: khong loc theo chuyen, khong loc theo vong chay.
      runIds: null,
      runTripIds: null,
      driverId: null,
      supplierId: null,
      from: null,
      to: null,
      ...patch,
      vehicleId,
    };
  }
}
