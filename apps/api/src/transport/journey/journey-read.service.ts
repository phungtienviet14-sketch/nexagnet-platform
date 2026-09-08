import { Injectable, Optional } from '@nestjs/common';
import { summariseRunDistance } from '../movement/run-distance.js';
import { TransportDomainError } from '../transport.errors.js';
import { buildLegGeometry } from './journey-geometry.js';
import {
  JourneyCheckpointFacts,
  JourneyCoreFacts,
  JourneyFuelFacts,
  JourneyLocationFacts,
} from './journey-facts.port.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import type { RunLegPhase } from '../checkpoint/run-timeline.js';
import type {
  RunAssignment,
  RunLeg,
  TripRunLegLink,
  VehicleRun,
} from '../movement/movement.types.js';
import type { LocationObservation } from '../proof/tracking.types.js';
import type {
  JourneyEvent,
  JourneyLegView,
  JourneySource,
  RunJourneyMapView,
  RunJourneyView,
} from './journey.types.js';

/**
 * BAO CAO BAN DO CUA MOT VONG CHAY — mot lan doc, khong mot duong ghi nao (#278 N5).
 *
 * ===========================================================================
 * NHAN CA `runId` LAN `runCode`, VA DO KHONG PHAI MOT TIEN ICH.
 *
 * `navigation.ts` cam mot `id` ky thuat di len dia chi (`SELECTION_QUERY_PARAM`), nen thu ma man
 * hinh cam trong tay khi nguoi dung bam vao mot the la MA vong chay. Neu tuyen nay chi nhan `id`
 * thi man hinh se phai doc ca danh sach vong chay de doi ma -> `id` truoc moi lan mo bao cao —
 * dung mot vong N+1 doi lot mot phep tra cuu.
 *
 * ===========================================================================
 * BON NGUON, VA MOT NGUON VANG KHONG LAM MAT CA BAO CAO.
 *
 * Cung khuon `ControlTowerReadService`. Tat `transport-checkpoint` thi khong con toa do va khong
 * con dong thoi gian — nhung danh sach chang, km co hang/rong, va ma don VAN dung, vi chung thuoc
 * `transport-core`. Bao cao con lai la mot bao cao that, chi khong co ban do.
 */
@Injectable()
export class JourneyReadService {
  constructor(
    private readonly core: JourneyCoreFacts,
    @Optional() private readonly checkpoints?: JourneyCheckpointFacts,
    @Optional() private readonly location?: JourneyLocationFacts,
    @Optional() private readonly fuel?: JourneyFuelFacts,
  ) {}

  /** BAO CAO — KHONG mot toa do nao. Di sau `transport.run.read`. */
  async runJourney(runRef: string): Promise<RunJourneyView> {
    const run = await this.requireRun(runRef);
    const unavailableSources: JourneySource[] = [];

    const legs = await this.orderedLegs(run.id);
    const [assignments, vehicle, orders, tripLinks] = await Promise.all([
      this.core.listRunAssignments(run.id),
      this.core.findVehicle(run.vehicleId),
      this.core.listOrders(),
      this.tripLinksFor(legs),
    ]);

    const orderCodeById = new Map(orders.map((order) => [order.id, order.code] as const));
    const tripByLeg = new Map(tripLinks.map((link) => [link.legId, link.tripId] as const));
    const phases = await this.readPhases(run.id, unavailableSources);

    const legViews = legs.map(
      (leg): JourneyLegView => ({
        legId: leg.id,
        sequence: leg.sequence,
        kind: leg.kind,
        status: leg.status,
        orderCode: leg.orderId === null ? null : (orderCodeById.get(leg.orderId) ?? null),
        originLabel: leg.originLabel,
        destinationLabel: leg.destinationLabel,
        businessDate: leg.businessDate,
        distanceKm: leg.distanceKm,
        startedAt: leg.startedAt,
        completedAt: leg.completedAt,
        phase: phases?.[leg.id] ?? null,
      }),
    );

    const timeline = await this.buildTimeline(run.id, tripByLeg, unavailableSources);

    return {
      run: {
        runId: run.id,
        runCode: run.code,
        vehicleId: run.vehicleId,
        vehiclePlate: vehicle?.registrationPlate ?? null,
        status: run.status,
        businessDate: run.businessDate,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        driverId: activeDriverOf(assignments),
      },
      /*
       * `summariseRunDistance` doc NGUYEN VEN. Bao cao nay khong cong lai km tu hinh hoc — mot
       * duong ve tren ban do dai bao nhieu la mot cau hoi KHAC voi xe da chay bao nhieu km, va tron
       * hai cau do lai la cach chac chan nhat de mot bao cao dep hon su that.
       */
      distance: summariseRunDistance(legs),
      orderCodes: [
        ...new Set(legViews.flatMap((leg) => (leg.orderCode === null ? [] : [leg.orderCode]))),
      ].sort(),
      legs: legViews,
      timeline,
      unavailableSources,
    };
  }

  /**
   * BAN DO — CO toa do. Di sau `transport.location.history.read`.
   *
   * Ham RIENG chu khong phai mot co `includeGeometry` tren ham tren: mot tham so boolean thi mot
   * ngay nao do se co nguoi truyen `true` tu mot tuyen mang ma quyen khac, va khong bai kiem nao
   * cua auth thay. Hai ham thi tuyen ban do KHONG CO duong nao khac de goi.
   */
  async runJourneyMap(runRef: string): Promise<RunJourneyMapView> {
    const run = await this.requireRun(runRef);
    const unavailableSources: JourneySource[] = [];

    const legs = await this.orderedLegs(run.id);
    const tripLinks = await this.tripLinksFor(legs);
    const tripByLeg = new Map(tripLinks.map((link) => [link.legId, link.tripId] as const));

    const checkpointsByLeg = await this.readCheckpoints(run.id, unavailableSources);
    const observationsById = await this.readCheckpointObservations(
      checkpointsByLeg,
      unavailableSources,
    );
    const rawByLeg = await this.readRawObservations(legs, tripByLeg);

    return {
      runId: run.id,
      runCode: run.code,
      legs: legs.map((leg) => ({
        legId: leg.id,
        sequence: leg.sequence,
        kind: leg.kind,
        ...buildLegGeometry({
          checkpoints: checkpointsByLeg?.get(leg.id) ?? [],
          observationsById,
          rawObservations: rawByLeg.get(leg.id) ?? null,
        }),
      })),
      unavailableSources,
    };
  }

  private async requireRun(runRef: string): Promise<VehicleRun> {
    const run = (await this.core.findRun(runRef)) ?? (await this.core.findRunByCode(runRef));
    if (!run) {
      throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');
    }
    return run;
  }

  private async orderedLegs(runId: string): Promise<readonly RunLeg[]> {
    return [...(await this.core.listLegs(runId))].sort(
      (left, right) => left.sequence - right.sequence,
    );
  }

  private tripLinksFor(legs: readonly RunLeg[]): Promise<readonly TripRunLegLink[]> {
    if (legs.length === 0) return Promise.resolve([]);
    return this.core.findTripLinksByLegs(legs.map((leg) => leg.id));
  }

  /**
   * MOC theo `legId`. `null` = khong co nguon moc (capability tat).
   *
   * Moc muc VONG CHAY (`ASSIGNED`/`DEPARTED`/`COMPLETED`) co `legId === null` va co y bi bo o day:
   * chung khong thuoc mot chang nao, nen dua chung vao hinh hoc cua mot chang la gan mot toa do cho
   * nham cho. Chung van len DONG THOI GIAN — xem `buildTimeline`.
   */
  private async readCheckpoints(
    runId: string,
    unavailable: JourneySource[],
  ): Promise<ReadonlyMap<string, readonly RunCheckpoint[]> | null> {
    const checkpoints = this.checkpoints;
    if (!checkpoints) {
      unavailable.push('CHECKPOINT');
      return null;
    }

    const grouped = new Map<string, RunCheckpoint[]>();
    for (const checkpoint of await checkpoints.listForRun(runId)) {
      if (checkpoint.legId === null) continue;
      const bucket = grouped.get(checkpoint.legId) ?? [];
      bucket.push(checkpoint);
      grouped.set(checkpoint.legId, bucket);
    }
    return grouped;
  }

  private async readCheckpointObservations(
    checkpointsByLeg: ReadonlyMap<string, readonly RunCheckpoint[]> | null,
    unavailable: JourneySource[],
  ): Promise<ReadonlyMap<string, LocationObservation>> {
    const location = this.location;
    if (!location) {
      unavailable.push('LOCATION_PROOF');
      return new Map();
    }
    if (checkpointsByLeg === null) return new Map();

    const ids = [
      ...new Set(
        [...checkpointsByLeg.values()].flatMap((entries) =>
          entries.flatMap((entry) => (entry.observationId === null ? [] : [entry.observationId])),
        ),
      ),
    ];

    const found = await Promise.all(ids.map((id) => location.findObservation(id)));
    return new Map(
      found.flatMap((observation) =>
        observation === null ? [] : [[observation.id, observation] as const],
      ),
    );
  }

  /**
   * BAN DINH VI THO cua tung chang.
   *
   * `TransportTripRunLegLink` la MOT-MOT (`tripId` la khoa chinh, `legId` la `@unique`), nen MOI ban
   * dinh vi cua cac phien thuoc chuyen do la cua DUNG chang nay. Khong can loc theo khoang thoi
   * gian, va do la diem quan trong: mot phep loc theo `[startedAt, completedAt]` se am tham vut bo
   * doan duong truoc khi ai do bam nut bat dau chang.
   *
   * Chang khong co trong `Map` tra ve nghia la khong noi voi mot chuyen nao — `buildLegGeometry`
   * doc do thanh `NO_TRACKING_SESSION`, khac han voi "co phien nhung chua ban dinh vi nao".
   */
  private async readRawObservations(
    legs: readonly RunLeg[],
    tripByLeg: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, readonly LocationObservation[]>> {
    const location = this.location;
    const result = new Map<string, readonly LocationObservation[]>();
    if (!location) return result;

    for (const leg of legs) {
      const tripId = tripByLeg.get(leg.id);
      if (tripId === undefined) continue;
      const sessions = await location.listSessionsForTrip(tripId);
      const observations = await Promise.all(
        sessions.map((session) => location.listObservations(session.id)),
      );
      result.set(leg.id, observations.flat());
    }

    return result;
  }

  /** Giai doan tung chang — cung nguon voi bang dieu hanh, khong mot phep suy thu hai. */
  private async readPhases(
    runId: string,
    unavailable: JourneySource[],
  ): Promise<Readonly<Record<string, RunLegPhase>> | null> {
    const checkpoints = this.checkpoints;
    if (!checkpoints) {
      unavailable.push('CHECKPOINT');
      return null;
    }
    return (await checkpoints.timelineForRun(runId)).legPhases;
  }

  /**
   * DONG THOI GIAN — moc truoc, roi tron phieu do dau vao dung cho theo gio.
   *
   * Moc muc vong chay VAO day (khac voi hinh hoc): `DEPARTED` la mot su kien co that cua vong chay,
   * va bo no di se lam dong thoi gian bat dau tu giua duong.
   */
  private async buildTimeline(
    runId: string,
    tripByLeg: ReadonlyMap<string, string>,
    unavailable: JourneySource[],
  ): Promise<readonly JourneyEvent[]> {
    const events: JourneyEvent[] = [];

    const checkpoints = this.checkpoints;
    if (checkpoints !== undefined) {
      const timeline = await checkpoints.timelineForRun(runId);
      for (const entry of timeline.entries) {
        events.push({
          kind: 'CHECKPOINT',
          code: entry.type,
          at: entry.at.toISOString(),
          legId: entry.legId,
          hasLocationProof: entry.hasLocationProof,
          subjectId: entry.checkpointId,
        });
      }
    }

    const fuel = this.fuel;
    if (!fuel) {
      unavailable.push('FUEL');
    } else {
      for (const [legId, tripId] of tripByLeg) {
        for (const entry of await fuel.listEntriesByTrip(tripId)) {
          events.push({
            kind: 'FUEL',
            code: 'FUEL_ENTRY',
            at: entry.occurredAt,
            legId,
            /* Mot phieu do dau khong mang ban dinh vi — noi that thay vi de trong. */
            hasLocationProof: false,
            subjectId: entry.id,
          });
        }
      }
    }

    return events.sort(
      (left, right) =>
        left.at.localeCompare(right.at) || left.subjectId.localeCompare(right.subjectId),
    );
  }
}

const activeDriverOf = (assignments: readonly RunAssignment[]): string | null =>
  assignments.find((assignment) => assignment.effectiveTo === null)?.driverId ?? null;
