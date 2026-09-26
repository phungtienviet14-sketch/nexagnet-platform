import { Inject, Injectable } from '@nestjs/common';
import type { GeoPoint } from '../geo/geo-point.js';
import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import { TRANSPORT_PLANNING_POLICY } from '../planning/planning-policy.js';
import type { OrderRunPlan, TransportPlanningPolicy } from '../planning/planning.types.js';
import type { CommercialReadinessFacts } from './commercial-readiness.js';
import {
  TransportSiteIntakeCoreFacts,
  TransportSiteIntakeGeoFacts,
  type SiteIntakeDriverProfile,
  type SiteIntakeSiteProfile,
} from './site-intake-facts.port.js';
import type { SiteIntakeCommercial } from './site-intake-commercial.types.js';
import type { RunSiteIntake } from './site-intake.types.js';

/** Su that NGOAI kho thuong mai: ho so lai xe, xe dang cam, dia diem va hang rao cua no. */
export interface ReadinessExternalFacts {
  readonly driver: SiteIntakeDriverProfile | null;
  readonly driverVehicleId: string | null;
  readonly site: SiteIntakeSiteProfile | null;
  readonly originPoints: readonly GeoPoint[];
}

export interface ReadinessOwnFacts {
  readonly intake: RunSiteIntake;
  readonly commercial: SiteIntakeCommercial;
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  readonly runDriverId: string | null;
  readonly activeRunPlans: readonly OrderRunPlan[];
}

/** Nhan dia diem lay hang — CUNG chuoi voi `originLabel` cua chang ma `#267` da ghi. */
export const siteLabel = (site: { counterpartyName: string; siteName: string }): string =>
  `${site.counterpartyName} — ${site.siteName}`;

/**
 * GOM SU THAT cho `evaluateCommercialReadiness` — MOT noi, cho CA duong ghi (duoi khoa) lan duong
 * doc (man hinh, thap dieu hanh). Hai duong tu gom se lech nhau o lan sua thu hai, va luc do hang
 * "Can xu ly" noi mot dieu con lenh "Hoan thien" noi dieu khac.
 */
@Injectable()
export class SiteIntakeReadinessReader {
  constructor(
    private readonly core: TransportSiteIntakeCoreFacts,
    private readonly geo: TransportSiteIntakeGeoFacts,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly planning: TransportPlanningPolicy,
  ) {}

  get grouping(): TransportPlanningPolicy['grouping'] {
    return this.planning.grouping;
  }

  async external(intake: RunSiteIntake): Promise<ReadinessExternalFacts> {
    const [driver, driverVehicleId, site, fences] = await Promise.all([
      this.core.findDriver(intake.driverId),
      this.core.activeVehicleForDriver(intake.driverId),
      this.core.findSite(intake.siteId),
      this.geo.listActiveSiteFences(),
    ]);
    return {
      driver,
      driverVehicleId,
      site,
      originPoints: fences
        .filter((fence) => fence.siteId === intake.siteId)
        .map((fence) => fence.centre),
    };
  }

  facts(own: ReadinessOwnFacts, external: ReadinessExternalFacts): CommercialReadinessFacts {
    const leg = own.legs.find((entry) => entry.id === own.intake.legId);
    const legFacts = leg
      ? { kind: leg.kind, status: leg.status, orderId: leg.orderId }
      : // Chang cua lan nhan viec khong con doc duoc: coi nhu da huy — khong bao gio tu tao don
        // tren mot chang khong ai thay.
        ({ kind: 'LOADED', status: 'CANCELLED', orderId: null } as const);
    return {
      status: own.commercial.status,
      boundOrderId: own.commercial.binding?.orderId ?? null,
      siteMatch: own.intake.siteMatch,
      originAttested: own.commercial.originAttestation !== null,
      destination: own.commercial.destination
        ? { label: own.commercial.destination.label, point: own.commercial.destination.point }
        : null,
      intakeDriverId: own.intake.driverId,
      run: { status: own.run.status, vehicleId: own.run.vehicleId },
      leg: legFacts,
      runDriverId: own.runDriverId,
      driver:
        external.driver === null
          ? null
          : { active: external.driver.active, currentVehicleId: external.driverVehicleId },
      site: {
        active: external.site?.active ?? false,
        label: external.site ? siteLabel(external.site) : '',
        originPoints: external.originPoints,
      },
      runCarriesOtherOneOrderPlan: own.activeRunPlans.some(
        (plan) =>
          plan.loadedLegId !== own.intake.legId &&
          (plan.grouping === 'ONE_ORDER_PER_RUN' || this.planning.grouping === 'ONE_ORDER_PER_RUN'),
      ),
    };
  }
}
