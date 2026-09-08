import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import { DEFAULT_ACCURACY_POLICY } from '../geo/location-quality.js';
import type { Order } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Vehicle } from '../transport.types.js';
import {
  TRANSPORT_DISPATCH_DECISIONS,
  type DispatchPickupResolutionReason,
  type DispatchRouteEstimateReason,
} from './dispatch-decisions.js';
import {
  DispatchComplianceFacts,
  DispatchCoreFacts,
  DispatchLocationFacts,
} from './dispatch-facts.port.js';
import { DispatchAssignmentPlanner, type DispatchCommitResult } from './dispatch-planner.port.js';
import {
  DISPATCH_CLOCK,
  TRANSPORT_DISPATCH_POLICY,
  type DispatchClock,
  type TransportDispatchPolicy,
} from './dispatch-policy.js';
import { rankCandidates, type RankableCandidate } from './dispatch-ranking.js';
import { describeCandidate, describeExclusion } from './dispatch-reason.js';
import {
  NO_DISPATCH_REQUIREMENT,
  assessSuitability,
  type DispatchRequirement,
  type SuitabilityVerdict,
} from './dispatch-suitability.js';
import type {
  DispatchCandidate,
  DispatchCandidateMode,
  DispatchExclusion,
  DispatchSuggestionView,
  ResolvedPlace,
  ResolvedPlaceView,
  VehicleCurrentLocationView,
  VehicleCurrentState,
  VehicleNextFree,
} from './dispatch.types.js';
import {
  explicitPointPlace,
  resolvePlaceByGeofenceId,
  resolvePlaceByLabel,
  resolvePlaceBySiteId,
  type PlaceIndexEntry,
} from './place-resolution.js';
import { TransportRoutingPort } from './routing/transport-routing.port.js';
import { truckFingerprint } from './routing/routing.types.js';
import type { RouteEstimate, TruckProfile } from './routing/routing.types.js';
import { truckProfileForVehicle } from './truck-profile.js';
import {
  gradeFreshness,
  orderRemainingLegs,
  projectCurrentState,
  projectNextFree,
  type RemainingLegFact,
  type RemainingLegPlan,
} from './vehicle-state-projection.js';

/**
 * DIEU XE — tra loi *"xe nao phu hop nhat de nhan don nay"*, va KHONG ghi mot dong nao (`#277`).
 *
 * ===========================================================================
 * MOT DUONG DOC, MOT DUONG GHI, VA CHUNG KHONG CHAM NHAU
 *
 * `suggest()` doc. Moi thu no cham la mot cong chi-doc (`dispatch-facts.port.ts`), nen cau
 * *"xem mot bang de nghi khong doi mot hang du lieu nao"* la mot tinh chat KIEM DUOC LUC BIEN
 * DICH, khong phai mot loi hua trong tai lieu.
 *
 * `commit()` ghi — nhung khong tu quyet dinh gi. No CHAY LAI `suggest()` tren su that hien tai,
 * doi chieu voi chiec xe ma con nguoi da chon, roi chuyen cho `DispatchAssignmentPlanner`. Neu su
 * that da doi ke tu luc bang duoc ve, no tra `DISPATCH_RECOMMENDATION_STALE` chu khong ep lan
 * chon cu di tiep (`#277 M9`).
 *
 * ===========================================================================
 * MOT SU THAT PHAI NOI RA TRUOC: DON KHONG MANG TOA DO
 *
 * `TransportOrder` co `originLabel`/`destinationLabel` la CHUOI, khong co cot toa do, khong co han
 * lay hang, khong co khoi luong hang. Ba dieu do quyet dinh hinh dang cua ca be mat nay:
 *
 *   · diem lay hang phai GIAI ra tu ten (`place-resolution.ts`), va khi khong giai duoc thi tra
 *     `DISPATCH_PICKUP_LOCATION_UNRESOLVED` chu khong doan;
 *   · han lay hang va yeu cau tai trong den tu NGUOI GOI, va khi khong ai khai thi cac buoc xep
 *     hang tuong ung bi BO QUA chu khong chay voi mot gia tri bia.
 */

/** Cach nguoi goi chi dinh diem lay hang — ba duong, deu tuong minh. */
export type DispatchPickupRef =
  | { readonly kind: 'POINT'; readonly latitude: unknown; readonly longitude: unknown }
  | { readonly kind: 'SITE'; readonly siteId: string }
  | { readonly kind: 'GEOFENCE'; readonly geofenceId: string };

export interface DispatchSuggestionRequest {
  /** `null` = de he thong giai tu `originLabel` cua don. */
  readonly pickup: DispatchPickupRef | null;
  readonly requiredPickupAt: string | null;
  readonly requirement: DispatchRequirement;
  /** So dong toi da tra ve. `null` = theo tran cua chinh sach. */
  readonly limit: number | null;
}

export const EMPTY_DISPATCH_REQUEST: DispatchSuggestionRequest = {
  pickup: null,
  requiredPickupAt: null,
  requirement: NO_DISPATCH_REQUIREMENT,
  limit: null,
};

/**
 * AI DANG HOI — va ho duoc thay den dau.
 *
 * `canReadLocationHistory` la ket qua cua mot phep kiem quyen o tang bien, khong phai mot co ma
 * nguoi goi tu bat. Xem `VehicleCurrentLocationView.point` cho ly do no ton tai.
 */
export interface DispatchCaller {
  readonly actor: string;
  readonly canReadLocationHistory: boolean;
}

export interface DispatchCommitView {
  readonly orderId: string;
  readonly vehicleId: string;
  readonly runId: string;
  readonly legId: string;
  readonly created: boolean;
  readonly committedAt: string;
}

/** Trang thai trung gian cua MOT chiec xe trong mot lan tinh — khong ra ngoai service. */
interface VehicleAssessment {
  readonly vehicle: Vehicle;
  readonly truckProfile: TruckProfile;
  readonly current: VehicleCurrentState;
  readonly currentPlace: ResolvedPlace | null;
  readonly currentUsableAsOrigin: boolean;
  readonly hasCommittedWork: boolean;
  readonly nextFree: VehicleNextFree;
  readonly suitability: SuitabilityVerdict;
}

/** Mot diem xuat phat ung vien TRUOC khi biet quang duong duong bo. */
interface CandidateOrigin {
  readonly assessment: VehicleAssessment;
  readonly mode: DispatchCandidateMode;
  readonly place: ResolvedPlace;
  readonly availableAt: string | null;
  readonly availableAtIsLowerBound: boolean;
  readonly interruptsCommittedWork: boolean;
  readonly crowMetres: number;
}

/**
 * Ung vien da du dai luong de sap thu tu, VA giu ban day du di kem.
 *
 * Ghep hai thu vao mot doi tuong thay vi tra cuu lai sau khi sap: MOT chiec xe co the sinh HAI
 * dong (di ngay tu cho dang dung ⟂ di sau khi xong viec), nen mot bang tra cuu theo ma xe se nuot
 * mat mot trong hai — va nuot mot cach im lang.
 */
interface RankedCandidate extends RankableCandidate {
  readonly candidate: DispatchCandidate;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly core: DispatchCoreFacts,
    private readonly routing: TransportRoutingPort,
    private readonly planner: DispatchAssignmentPlanner,
    @Inject(TRANSPORT_DISPATCH_POLICY) private readonly policy: TransportDispatchPolicy,
    @Optional() private readonly location?: DispatchLocationFacts,
    @Optional() private readonly compliance?: DispatchComplianceFacts,
    @Optional() private readonly telemetry?: TelemetryService,
    /**
     * DONG HO TIEM VAO — mot token, khong phai mot tham so co gia tri mac dinh.
     *
     * Nest giai tham so ham dung theo KIEU luc bien dich. Kieu cua mot ham la `Function`, va khong
     * ai dang ky mot provider ten `Function` — nen mot tham so `now: () => Date = ...` se chet luc
     * khoi dong du no co ve nhu co mac dinh. Mot token co `@Optional()` thi khong.
     */
    @Optional() @Inject(DISPATCH_CLOCK) private readonly clock?: DispatchClock,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  /* ------------------------------------------------------------------ *
   * DOC — khong mot lan ghi nao
   * ------------------------------------------------------------------ */

  async suggest(
    orderId: string,
    request: DispatchSuggestionRequest,
    caller: DispatchCaller,
  ): Promise<DispatchSuggestionView> {
    const order = await this.requireOpenOrder(orderId);
    const placeIndex = (await this.location?.placeIndex()) ?? [];
    const pickup = this.resolvePickup(order, request.pickup, placeIndex);
    const requiredPickupAtMs = this.parseRequiredPickupAt(request.requiredPickupAt);

    const now = this.now();
    const vehicles = await this.core.listVehicles();
    const budget = { remaining: this.policy.maxProjectionRouteCalls };

    const assessments: VehicleAssessment[] = [];
    for (const vehicle of vehicles) {
      assessments.push(await this.assess(vehicle, request.requirement, placeIndex, now, budget));
    }

    const excluded: DispatchExclusion[] = assessments
      .filter((assessment) => assessment.suitability.exclusions.length > 0)
      .map((assessment) => ({
        vehicleId: assessment.vehicle.id,
        registrationPlate: assessment.vehicle.registrationPlate,
        reasons: assessment.suitability.exclusions,
        reasonSummary: describeExclusion(assessment.suitability.exclusions),
      }));

    for (const entry of excluded) {
      for (const reason of entry.reasons) {
        this.telemetry?.decision({
          vocabulary: TRANSPORT_DISPATCH_DECISIONS,
          point: 'dispatch.candidate_filter',
          outcome: 'denied',
          reason,
          detail: { vehicleId: entry.vehicleId, orderId },
        });
      }
    }

    const origins = this.buildCandidateOrigins(
      assessments.filter((assessment) => assessment.suitability.exclusions.length === 0),
      pickup.place.point,
    );

    /*
     * DUONG CHIM BAY XUAT HIEN O DAY, VA CHET O DAY.
     *
     * `#277 M3`: *"straight-line distance may prefilter only; it must not be the final ranking
     * metric."* No duoc dung dung mot lan — cat danh sach xuong con `maxRoutedCandidates` de mot
     * doi xe lon khong bien mot lan mo bang thanh mot ma tran khong lo — roi moi con so di vao
     * bang xep hang deu la con so DUONG BO.
     */
    const routed = [...origins]
      .sort((left, right) => left.crowMetres - right.crowMetres)
      .slice(0, this.policy.maxRoutedCandidates);

    const estimates = await this.routeToPickup(routed, pickup.place.point);

    const rankable: RankedCandidate[] = [];
    routed.forEach((origin, index) => {
      const estimate = estimates[index];
      if (!estimate) return;
      const candidate = this.toCandidate(
        origin,
        estimate,
        requiredPickupAtMs,
        caller.canReadLocationHistory,
      );
      rankable.push({ ...this.toRankable(candidate), candidate });
    });

    const ordered = rankCandidates(rankable, this.policy.orderingKeys).map(
      (entry) => entry.candidate,
    );
    const limit = request.limit ?? this.policy.maxRoutedCandidates;

    return {
      orderId: order.id,
      orderCode: order.code,
      pickup: { place: pickup.place, resolution: pickup.reason },
      requiredPickupAt: request.requiredPickupAt,
      generatedAt: now.toISOString(),
      orderingKeys: this.policy.orderingKeys,
      candidates: ordered.slice(0, Math.max(0, limit)),
      excluded,
      assignmentCreated: false,
    };
  }

  /* ------------------------------------------------------------------ *
   * GHI — chi sau khi mot con nguoi da chon
   * ------------------------------------------------------------------ */

  /**
   * BOSS XAC NHAN. Ba viec, theo dung thu tu, va khong viec nao bo duoc.
   *
   *   1. TINH LAI bang de nghi tren su that HIEN TAI. Ket qua ma nguoi dung nhin co the da vai
   *      phut tuoi; trong vai phut do mot chiec xe co the nhan viec khac, hong, hoac ra khoi vung.
   *   2. DOI CHIEU lua chon cua con nguoi voi ket qua vua tinh. Khong con trong danh sach nghia la
   *      su that da doi — tra `DISPATCH_RECOMMENDATION_STALE` de nguoi dung nhin lai, chu khong ep
   *      mot quyet dinh cu di tiep.
   *   3. CHUYEN cho bo lap ke hoach. Lane M khong ghi vong chay/chang bang tay o day.
   */
  async commit(
    orderId: string,
    vehicleId: string,
    request: DispatchSuggestionRequest,
    caller: DispatchCaller,
  ): Promise<DispatchCommitView> {
    const vehicle = await this.core.findVehicle(vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound('DISPATCH_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }

    const revalidated = await this.suggest(orderId, request, caller);
    const stillRecommended = revalidated.candidates.some(
      (candidate) => candidate.vehicleId === vehicleId,
    );
    if (!stillRecommended) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DISPATCH_DECISIONS,
        point: 'dispatch.commit',
        outcome: 'denied',
        reason: 'COMMIT_REVALIDATION_FAILED',
        detail: { orderId, vehicleId },
      });
      throw TransportDomainError.conflict(
        'DISPATCH_RECOMMENDATION_STALE',
        'Chiec xe nay khong con trong danh sach de nghi. Hay xem lai bang truoc khi giao viec.',
      );
    }

    const result: DispatchCommitResult = await this.planner.commit({
      orderId,
      vehicleId,
      actor: caller.actor,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DISPATCH_DECISIONS,
      point: 'dispatch.commit',
      outcome: 'allowed',
      reason: result.reason,
      detail: { orderId, vehicleId, runId: result.runId, created: result.created },
    });

    return {
      orderId,
      vehicleId,
      runId: result.runId,
      legId: result.legId,
      created: result.created,
      committedAt: this.now().toISOString(),
    };
  }

  /* ------------------------------------------------------------------ *
   * NOI BO
   * ------------------------------------------------------------------ */

  private async requireOpenOrder(orderId: string): Promise<Order> {
    const order = await this.core.findOrder(orderId);
    if (!order) {
      throw TransportDomainError.notFound(
        'DISPATCH_ORDER_NOT_FOUND',
        'Khong tim thay nghia vu thuong mai.',
      );
    }
    if (order.status === 'CANCELLED') {
      throw TransportDomainError.conflict(
        'DISPATCH_ORDER_CANCELLED',
        'Nghia vu thuong mai da huy.',
      );
    }
    return order;
  }

  private parseRequiredPickupAt(raw: string | null): number | null {
    if (raw === null) return null;
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      throw TransportDomainError.invalid(
        'DISPATCH_REQUIRED_PICKUP_AT_INVALID',
        'Moc gio yeu cau lay hang khong doc duoc.',
      );
    }
    return parsed;
  }

  private resolvePickup(
    order: Order,
    ref: DispatchPickupRef | null,
    index: readonly PlaceIndexEntry[],
  ): { place: ResolvedPlace; reason: DispatchPickupResolutionReason } {
    const resolution = this.resolvePickupRef(order, ref, index);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DISPATCH_DECISIONS,
      point: 'dispatch.pickup_resolution',
      outcome: resolution.ok ? 'allowed' : 'denied',
      reason: resolution.reason,
      detail: { orderId: order.id },
    });

    if (!resolution.ok) {
      const kind =
        resolution.reason === 'PICKUP_REQUEST_POINT_REJECTED'
          ? ('DISPATCH_POINT_INVALID' as const)
          : resolution.reason === 'PICKUP_REQUEST_REF_NOT_FOUND'
            ? ('DISPATCH_PLACE_REF_NOT_FOUND' as const)
            : ('DISPATCH_PICKUP_LOCATION_UNRESOLVED' as const);
      throw TransportDomainError.invalid(
        kind,
        'Chua xac dinh duoc diem lay hang cua don. Hay chon mot dia diem da khai hang rao.',
      );
    }
    return { place: resolution.place, reason: resolution.reason };
  }

  private resolvePickupRef(
    order: Order,
    ref: DispatchPickupRef | null,
    index: readonly PlaceIndexEntry[],
  ):
    | { ok: true; place: ResolvedPlace; reason: DispatchPickupResolutionReason }
    | { ok: false; reason: DispatchPickupResolutionReason } {
    if (ref === null) return resolvePlaceByLabel(order.originLabel, index);
    if (ref.kind === 'GEOFENCE') return resolvePlaceByGeofenceId(ref.geofenceId, index);
    if (ref.kind === 'SITE') return resolvePlaceBySiteId(ref.siteId, index);

    const parsed = parseGeoPoint(ref.latitude, ref.longitude);
    if (!parsed.ok) return { ok: false, reason: 'PICKUP_REQUEST_POINT_REJECTED' };
    return {
      ok: true,
      reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
      place: explicitPointPlace(parsed.point, order.originLabel),
    };
  }

  private async assess(
    vehicle: Vehicle,
    requirement: DispatchRequirement,
    index: readonly PlaceIndexEntry[],
    now: Date,
    budget: { remaining: number },
  ): Promise<VehicleAssessment> {
    const truckProfile = truckProfileForVehicle(vehicle);
    const sample = (await this.location?.latestObservationForVehicle(vehicle.id)) ?? null;

    const current: VehicleCurrentState = this.location
      ? projectCurrentState(sample, now, this.policy, DEFAULT_ACCURACY_POLICY)
      : { known: false, reason: 'LOCATION_CAPABILITY_ABSENT' };

    const currentUsableAsOrigin =
      current.known && gradeFreshness(current.location.ageSeconds, this.policy) !== 'STALE';

    const currentPlace: ResolvedPlace | null = current.known
      ? {
          point: current.location.point,
          source: 'VEHICLE_OBSERVATION',
          label: vehicle.registrationPlate,
          geofenceId: null,
          siteId: null,
        }
      : null;

    const remaining = orderRemainingLegs(await this.openLegFacts(vehicle.id));
    const plans = await this.planRemainingLegs(
      remaining,
      currentPlace,
      truckProfile,
      index,
      budget,
    );

    const projected = projectNextFree({
      currentPlace: currentUsableAsOrigin ? currentPlace : null,
      remaining: plans,
      now,
      stopServiceSeconds: this.policy.stopServiceSeconds,
    });
    const nextFree: VehicleNextFree =
      currentPlace === null &&
      plans.length > 0 &&
      !projected.gaps.includes('CURRENT_POSITION_UNKNOWN')
        ? { ...projected, gaps: [...projected.gaps, 'CURRENT_POSITION_UNKNOWN'] }
        : projected;

    const readiness = this.compliance ? await this.compliance.readinessForVehicle(vehicle) : null;

    return {
      vehicle,
      truckProfile,
      current,
      currentPlace,
      currentUsableAsOrigin,
      hasCommittedWork: plans.length > 0,
      nextFree,
      suitability: assessSuitability({
        vehicle,
        requirement,
        readiness,
        current,
        nextFree,
        truckProfile,
        currentUsableAsOrigin,
      }),
    };
  }

  private async openLegFacts(vehicleId: string): Promise<readonly RemainingLegFact[]> {
    const facts = await this.core.listOpenLegsForVehicle(vehicleId);
    return facts.map(({ leg, run }) => ({
      legId: leg.id,
      runId: leg.runId,
      orderId: leg.orderId,
      sequence: leg.sequence,
      status: leg.status,
      originLabel: leg.originLabel,
      destinationLabel: leg.destinationLabel,
      runStatus: run.status,
      runBusinessDate: run.businessDate,
      runCreatedAt: run.createdAt,
    }));
  }

  /**
   * Chuoi chang con lai -> ke hoach co GIO DI cua tung doan.
   *
   * Diem xuat phat cua doan dau la CHO XE DANG DUNG; tu doan thu hai tro di la diem den cua doan
   * truoc. Doan nao thieu mot dau — khong biet xe o dau, hoac nhan dia diem khong giai duoc — thi
   * `travelSeconds` la `null`, va `projectNextFree()` bien dieu do thanh mot `gap` co ten.
   */
  private async planRemainingLegs(
    remaining: readonly RemainingLegFact[],
    currentPlace: ResolvedPlace | null,
    truck: TruckProfile,
    index: readonly PlaceIndexEntry[],
    budget: { remaining: number },
  ): Promise<readonly RemainingLegPlan[]> {
    const plans: RemainingLegPlan[] = [];
    let from: ResolvedPlace | null = currentPlace;

    for (const leg of remaining) {
      const resolved = resolvePlaceByLabel(leg.destinationLabel, index);
      const destination = resolved.ok ? resolved.place : null;

      let travelSeconds: number | null = null;
      if (from !== null && destination !== null && budget.remaining > 0) {
        budget.remaining -= 1;
        const outcome = await this.routing.route({
          origin: from.point,
          destination: destination.point,
          truck,
          departAt: null,
        });
        travelSeconds = outcome.ok ? outcome.estimate.durationSeconds : null;
      }

      plans.push({ legId: leg.legId, orderId: leg.orderId, destination, travelSeconds });
      from = destination;
    }
    return plans;
  }

  /**
   * Sinh cac diem xuat phat ung vien cho MOT chiec xe.
   *
   * Xe RANH -> mot dong duy nhat (`CURRENT_NEAR`): cho dang dung va cho se ranh la MOT, nen phat
   * hai dong se lam bang dai gap doi ma khong them mot su that nao.
   *
   * Xe DANG CO VIEC -> hai dong, va day la dung cho `#277 M6` doi (*"evaluate at least two
   * candidate origins per vehicle where meaningful"*):
   *
   *   `NEXT_FREE_NEAR`  duong binh thuong — nhan viec sau khi lam xong viec dang co;
   *   `CURRENT_NEAR`    duong CAT NGANG — mang co `WOULD_INTERRUPT_COMMITTED_WORK`, va khoa
   *                     `NO_WORK_INTERRUPTION` bao dam no khong bao gio dung tren mot lua chon
   *                     khong cat ngang. No van duoc hien vi nguoi dieu xe co quyen biet rang
   *                     chiec xe gan nhat dang ban — quyet dinh la cua ho, khong phai cua bang.
   */
  private buildCandidateOrigins(
    assessments: readonly VehicleAssessment[],
    pickup: GeoPoint,
  ): readonly CandidateOrigin[] {
    const origins: CandidateOrigin[] = [];

    for (const assessment of assessments) {
      if (!assessment.hasCommittedWork) {
        if (assessment.currentUsableAsOrigin && assessment.currentPlace) {
          origins.push({
            assessment,
            mode: 'CURRENT_NEAR',
            place: assessment.currentPlace,
            availableAt: assessment.nextFree.availableAt,
            availableAtIsLowerBound: assessment.nextFree.availableAtIsLowerBound,
            interruptsCommittedWork: false,
            crowMetres: greatCircleMetres(assessment.currentPlace.point, pickup),
          });
        }
        continue;
      }

      if (assessment.nextFree.place) {
        origins.push({
          assessment,
          mode: 'NEXT_FREE_NEAR',
          place: assessment.nextFree.place,
          availableAt: assessment.nextFree.availableAt,
          availableAtIsLowerBound: assessment.nextFree.availableAtIsLowerBound,
          interruptsCommittedWork: false,
          crowMetres: greatCircleMetres(assessment.nextFree.place.point, pickup),
        });
      }

      if (
        this.policy.includeInterruptingCandidates &&
        assessment.currentUsableAsOrigin &&
        assessment.currentPlace
      ) {
        origins.push({
          assessment,
          mode: 'CURRENT_NEAR',
          place: assessment.currentPlace,
          availableAt: null,
          availableAtIsLowerBound: false,
          interruptsCommittedWork: true,
          crowMetres: greatCircleMetres(assessment.currentPlace.point, pickup),
        });
      }
    }

    return origins;
  }

  /**
   * MOT lan goi ma tran cho ca danh sach — khong phai N lan goi le. Xem `#277 M3`.
   *
   * "Mot lan cho MOT HO SO XE", chinh xac hon: `MatrixRequest` mang DUNG MOT `TruckProfile`, nen
   * gop nhung diem xuat phat co ho so KHAC NHAU vao mot lan goi se dinh tuyen ca nhom theo ho so
   * cua chiec dau tien — mot con so trong hoan toan binh thuong nhung thuoc ve mot chiec xe khac.
   *
   * Hom nay moi ho so deu rong nhu nhau (`truckProfileForVehicle()` chua co cot nao de doc), nen
   * phep gom luon cho ra DUNG MOT nhom va dung mot lan goi. No ton tai de ngay `TransportVehicle`
   * co cot kich thuoc, tang nay tu chia nhom — khong ai phai nho quay lai sua cho nay.
   */
  private async routeToPickup(
    origins: readonly CandidateOrigin[],
    pickup: GeoPoint,
  ): Promise<readonly (RouteEstimate | null)[]> {
    if (origins.length === 0) return [];

    const groups = new Map<string, number[]>();
    origins.forEach((origin, index) => {
      const key = truckFingerprint(origin.assessment.truckProfile);
      const bucket = groups.get(key);
      if (bucket) bucket.push(index);
      else groups.set(key, [index]);
    });

    const estimates: (RouteEstimate | null)[] = origins.map(() => null);
    for (const indexes of groups.values()) {
      await this.routeGroupToPickup(origins, indexes, pickup, estimates);
    }
    return estimates;
  }

  private async routeGroupToPickup(
    origins: readonly CandidateOrigin[],
    indexes: readonly number[],
    pickup: GeoPoint,
    estimates: (RouteEstimate | null)[],
  ): Promise<void> {
    const outcome = await this.routing.matrix({
      origins: indexes.map((index) => origins[index]!.place.point),
      destinations: [pickup],
      truck: origins[indexes[0]!]!.assessment.truckProfile,
      departAt: null,
    });

    if (!outcome.ok) {
      const reason: DispatchRouteEstimateReason =
        outcome.failure.reason === 'REQUEST_BOUND_EXCEEDED'
          ? 'ROUTE_REQUEST_BOUND_EXCEEDED'
          : outcome.failure.reason === 'PROVIDER_RATE_LIMITED'
            ? 'ROUTE_PROVIDER_RATE_LIMITED'
            : 'ROUTE_PROVIDER_UNAVAILABLE';
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DISPATCH_DECISIONS,
        point: 'dispatch.route_estimate',
        outcome: 'denied',
        reason,
        detail: { providerId: outcome.failure.providerId, candidates: origins.length },
      });
      /*
       * NHA CUNG CAP HONG -> TU CHOI CO KIEU, KHONG PHAI MOT BANG XEP HANG CHIM BAY.
       *
       * `#277 M13`: *"routing provider failure degrades to typed `ROUTING_UNAVAILABLE`, not
       * auto-select by straight-line fallback unless owner explicitly configures that fallback."*
       * Khong co cau hinh nao nhu the ton tai, nen khong co duong du phong nao ca.
       */
      throw TransportDomainError.conflict(
        outcome.failure.reason === 'REQUEST_BOUND_EXCEEDED'
          ? 'DISPATCH_MATRIX_BOUND_EXCEEDED'
          : 'DISPATCH_ROUTING_UNAVAILABLE',
        'Chua tinh duoc quang duong den diem lay hang. Hay thu lai sau.',
      );
    }

    for (const cell of outcome.cells) {
      if (cell.destinationIndex !== 0) continue;
      const originIndex = indexes[cell.originIndex];
      if (originIndex !== undefined) estimates[originIndex] = cell.estimate;
    }
  }

  private toCandidate(
    origin: CandidateOrigin,
    estimate: RouteEstimate,
    requiredPickupAtMs: number | null,
    canReadLocation: boolean,
  ): DispatchCandidate {
    const flags = origin.interruptsCommittedWork
      ? ([...origin.assessment.suitability.flags, 'WOULD_INTERRUPT_COMMITTED_WORK'] as const)
      : origin.assessment.suitability.flags;

    const availableAtMs = origin.availableAt ? Date.parse(origin.availableAt) : null;
    const pickupEtaMs =
      availableAtMs === null ? null : availableAtMs + estimate.durationSeconds * 1000;

    const routeReason: DispatchRouteEstimateReason = estimate.fromCache
      ? 'ROUTE_FROM_CACHE'
      : estimate.quality === 'SYNTHETIC'
        ? 'ROUTE_SYNTHETIC_ESTIMATE'
        : 'ROUTE_FROM_PROVIDER';

    const currentLocation: VehicleCurrentLocationView | null = origin.assessment.current.known
      ? {
          observedAt: origin.assessment.current.location.observedAt,
          ageSeconds: origin.assessment.current.location.ageSeconds,
          freshness: origin.assessment.current.location.freshness,
          accuracyGrade: origin.assessment.current.location.accuracyGrade,
          source: origin.assessment.current.location.source,
          point: canReadLocation ? origin.assessment.current.location.point : null,
          pointRedacted: !canReadLocation,
        }
      : null;

    return {
      vehicleId: origin.assessment.vehicle.id,
      registrationPlate: origin.assessment.vehicle.registrationPlate,
      mode: origin.mode,
      /*
       * Diem xuat phat `CURRENT_NEAR` LA vi tri cua chiec xe, nen toa do cua no chiu dung mot phep
       * che voi `VehicleCurrentLocationView.point`. Bo qua cho nay se lam ca phep che kia vo
       * nghia — du lieu bi che o mot truong roi lo nguyen ven o truong ben canh.
       */
      origin: this.redactOriginIfNeeded(origin.place, canReadLocation),
      availableAt: origin.availableAt,
      availableAtIsLowerBound: origin.availableAtIsLowerBound,
      emptyRoadMetresToPickup: estimate.roadDistanceMetres,
      roadSecondsToPickup: estimate.durationSeconds,
      pickupEtaAt: pickupEtaMs === null ? null : new Date(pickupEtaMs).toISOString(),
      meetsRequiredPickupAt:
        requiredPickupAtMs === null || pickupEtaMs === null
          ? null
          : pickupEtaMs <= requiredPickupAtMs,
      suitability: flags,
      currentLocation,
      nextFree: origin.assessment.nextFree,
      truckProfile: origin.assessment.truckProfile,
      route: {
        providerId: estimate.providerId,
        quality: estimate.quality,
        estimated: true,
        fromCache: estimate.fromCache,
        computedAt: estimate.computedAt,
        reason: routeReason,
      },
      reasonSummary: describeCandidate({
        mode: origin.mode,
        originLabel: origin.place.label,
        emptyRoadMetresToPickup: estimate.roadDistanceMetres,
        roadSecondsToPickup: estimate.durationSeconds,
        availableAt: origin.availableAt,
        availableAtIsLowerBound: origin.availableAtIsLowerBound,
        nextFree: origin.assessment.nextFree,
        flags,
        synthetic: estimate.quality === 'SYNTHETIC',
      }),
    };
  }

  /**
   * Toa do cua mot ban dinh vi XE bi bo di khi nguoi goi khong co quyen doc duong di.
   *
   * KHONG thay bang mot toa do khac (0,0 hay tam thanh pho): `parseGeoPoint()` tu choi Null Island
   * dung vi mot toa do gia se di tiep qua moi phep tinh nhu that. Cho nay bo HAN truong toa do —
   * ket qua la mot cho khong co toa do, va do la su that ma nguoi goi duoc phep biet.
   */
  private redactOriginIfNeeded(place: ResolvedPlace, canReadLocation: boolean): ResolvedPlaceView {
    if (place.source !== 'VEHICLE_OBSERVATION' || canReadLocation) {
      return { ...place, pointRedacted: false };
    }
    return {
      point: null,
      pointRedacted: true,
      source: place.source,
      label: 'Vi tri xe (khong du quyen xem toa do)',
      geofenceId: null,
      siteId: null,
    };
  }

  private toRankable(candidate: DispatchCandidate): RankableCandidate {
    return {
      vehicleId: candidate.vehicleId,
      registrationPlate: candidate.registrationPlate,
      meetsRequiredPickupAt: candidate.meetsRequiredPickupAt,
      interruptsCommittedWork: candidate.suitability.includes('WOULD_INTERRUPT_COMMITTED_WORK'),
      emptyRoadMetresToPickup: candidate.emptyRoadMetresToPickup,
      pickupEtaEpochMs: candidate.pickupEtaAt === null ? null : Date.parse(candidate.pickupEtaAt),
    };
  }
}
