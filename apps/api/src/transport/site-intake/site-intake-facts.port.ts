import { Injectable } from '@nestjs/common';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import { GeofenceRepository } from '../proof/geofence.repository.js';
import { TrackingRepository } from '../proof/tracking.repository.js';
import type { CounterpartySiteView } from '../counterparty/site.types.js';
import type { SiteFence } from './site-candidate.js';

/**
 * BA CUA SO tu `transport-site-intake` nhin sang hai capability khac.
 *
 * Cung khuon voi `TransportCheckpointCoreFacts` cua `#243` F1, va cung mot ly do: T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat.
 *
 * MOT NGOAI LE, va no duoc noi ra thay vi giau di: `TransportSiteIntakeRunWriter` CO ham ghi. Do
 * la vi `#267` H4 doi *"create or reuse accepted VehicleRun/RunLeg primitives"* — tuc lane nay
 * PHAI tao duoc mot vong chay, va cach dung la goi DICH VU DA DUOC CHAP NHAN cua Lane A
 * (`MovementService`), khong phai ghi thang vao `MovementRepository`. Cong nay chi phoi ba lenh
 * cua chinh dich vu do, nen khong co duong nao tu day sinh ra mot mo hinh vong chay thu hai.
 */

export interface SiteIntakeDriverFacts {
  readonly id: string;
  readonly fullName: string;
}

export interface SiteIntakeSiteFacts {
  readonly siteId: string;
  readonly siteName: string;
  readonly address: string | null;
  readonly counterpartyId: string;
  readonly counterpartyName: string;
}

export interface SiteIntakeOpenRun {
  readonly runId: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

export abstract class TransportSiteIntakeCoreFacts {
  /** Cau noi phien dang nhap -> ho so lai xe. Danh tinh KHONG bao gio den tu than yeu cau. */
  abstract findDriverByAuthUserId(authUserId: string): Promise<SiteIntakeDriverFacts | null>;
  /** Xe lai xe DANG cam. `null` = chua duoc giao xe nao. */
  abstract activeVehicleForDriver(driverId: string): Promise<string | null>;
  /** Vong chay chua ket thuc ma lai xe DANG cam — `#267` H3. */
  abstract listOpenRunsForDriver(driverId: string): Promise<readonly SiteIntakeOpenRun[]>;
  /** Dia diem CON HIEU LUC theo id, kem ten phap nhan. `null` = khong co that hoac da nghi. */
  abstract findActiveSite(siteId: string): Promise<SiteIntakeSiteFacts | null>;
  /** Doc theo lo — tang de nghi co N hang rao va khong duoc doc N lan. */
  abstract findActiveSites(
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, SiteIntakeSiteFacts>>;
}

/**
 * HANG RAO CUA CAC DIA DIEM VAN HANH, nhin tu ngoai `transport-proof`.
 *
 * Cong nay tra ve DUNG hinh dang ma `resolveSiteCandidates()` can, va khong hon: khong `label`,
 * khong `status`, khong `recordedBy`. Giu ranh gioi do thi tang nhan dang khong bao gio phu thuoc
 * vao mot cot trong bang hang rao.
 */
export abstract class TransportSiteIntakeGeoFacts {
  abstract listActiveSiteFences(): Promise<readonly SiteFence[]>;
}

export interface SiteIntakeObservationFacts {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  /** Dong ho MAY KHACH — khi thiet bi lay duoc toa do. */
  readonly capturedAt: Date;
  /** Dong ho MAY CHU — khi may chu nhan duoc no. */
  readonly receivedAt: Date;
  /** Lai xe so huu phien chua ban dinh vi nay. */
  readonly driverId: string;
}

export abstract class TransportSiteIntakeLocationFacts {
  abstract findObservation(observationId: string): Promise<SiteIntakeObservationFacts | null>;
}

@Injectable()
export class TransportSiteIntakeCoreFactsAdapter extends TransportSiteIntakeCoreFacts {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly movement: MovementRepository,
    /**
     * DICH VU, khong phai hai kho. `CounterpartySiteService` la thu ma `TransportModule` EXPORT, va
     * no da noi san dia diem voi phap nhan so huu — nen cong nay chi con phai doi ten truong.
     *
     * Doc thang hai kho la duong da duoc thu truoc: no BIEN DICH duoc, qua het bo test don vi (bai
     * tu tay dung adapter), va chet luc khoi dong voi
     * `Nest can't resolve ... CounterpartyRepository at index [3]` — vi `TransportModule` khong
     * export kho do. `app.module.transport-site-intake.boot.spec.ts` la thu duy nhat bat duoc.
     */
    private readonly sites: CounterpartySiteService,
  ) {
    super();
  }

  async findDriverByAuthUserId(authUserId: string): Promise<SiteIntakeDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  activeVehicleForDriver(driverId: string): Promise<string | null> {
    return this.fleet.activeVehicleForDriver(driverId);
  }

  async listOpenRunsForDriver(driverId: string): Promise<readonly SiteIntakeOpenRun[]> {
    const runs = await this.movement.listOpenRunsForDriver(driverId);
    return runs.map((run) => ({ runId: run.id, code: run.code, status: run.status }));
  }

  async findActiveSite(siteId: string): Promise<SiteIntakeSiteFacts | null> {
    const view = await this.sites.activeView(siteId);
    return view === null ? null : toFacts(view);
  }

  async findActiveSites(
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, SiteIntakeSiteFacts>> {
    const views = await this.sites.activeViews(siteIds);
    return new Map(views.map((view) => [view.site.id, toFacts(view)]));
  }
}

const toFacts = (view: CounterpartySiteView): SiteIntakeSiteFacts => ({
  siteId: view.site.id,
  siteName: view.site.name,
  address: view.site.address,
  counterpartyId: view.counterpartyId,
  counterpartyName: view.counterpartyName,
});

@Injectable()
export class TransportSiteIntakeGeoFactsAdapter extends TransportSiteIntakeGeoFacts {
  constructor(private readonly geofences: GeofenceRepository) {
    super();
  }

  async listActiveSiteFences(): Promise<readonly SiteFence[]> {
    const fences = await this.geofences.listActive();
    return fences
      .filter((fence) => fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null)
      .map((fence) => ({
        fenceId: fence.id,
        siteId: fence.subjectId as string,
        centre: { latitude: fence.latitude, longitude: fence.longitude },
        radiusMetres: fence.radiusMetres,
      }));
  }
}

@Injectable()
export class TransportSiteIntakeLocationFactsAdapter extends TransportSiteIntakeLocationFacts {
  constructor(private readonly tracking: TrackingRepository) {
    super();
  }

  async findObservation(observationId: string): Promise<SiteIntakeObservationFacts | null> {
    const observation = await this.tracking.findObservationById(observationId);
    if (!observation) return null;
    const session = await this.tracking.findSession(observation.sessionId);
    if (!session) return null;
    return {
      id: observation.id,
      latitude: observation.point.latitude,
      longitude: observation.point.longitude,
      accuracyMetres: observation.accuracyMetres,
      capturedAt: observation.capturedAt,
      receivedAt: observation.receivedAt,
      driverId: session.driverId,
    };
  }
}
