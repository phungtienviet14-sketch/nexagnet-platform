import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import { evaluateOrderCancel } from '../movement/movement-lifecycle.js';
import type { Order } from '../movement/movement.types.js';
import type { KnownPlace } from '../places/place-search.types.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  decideException,
  evaluateCommercialReadiness,
  evaluateOrderBinding,
  hasMovementStarted,
  siteIntakeOrderCode,
  siteIntakePlanKey,
  type CommercialReadiness,
  type SiteIntakeBindingDenyReason,
} from './commercial-readiness.js';
import {
  TRANSPORT_SITE_INTAKE_DECISIONS,
  type SiteIntakeCommercialReason,
  type SiteIntakeExceptionReason,
} from './site-intake-decisions.js';
import {
  TransportSiteIntakeCoreFacts,
  TransportSiteIntakeGeoFacts,
} from './site-intake-facts.port.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeCommercialStore, type CommercialScope } from './site-intake-commercial.store.js';
import type {
  ResolvedDestination,
  SiteIntakeActorRole,
  SiteIntakeBindingMode,
  SiteIntakeCommercial,
  SiteIntakeCommercialStatus,
  SiteIntakeExceptionOutcome,
} from './site-intake-commercial.types.js';
import { RunSiteIntakeRepository } from './site-intake.repository.js';
import type { RunSiteIntake } from './site-intake.types.js';

/**
 * LUA CHON DIEM GIAO tu may khach. HAI hinh dang, va KHONG hinh dang nao la "mot cap so tu do":
 *
 *   · `KNOWN_PLACE` — mot id hang rao; may chu tu doc nhan + toa do tu hang rao DANG hoat dong;
 *   · `VERIFIED_SEARCH` — mot ket qua tim dia diem ma tang ghep (controller) DA doi chieu lai voi
 *     chinh ket qua tim cua may chu (`#379` place search). Dich vu nay khong nhan mot toa do chua
 *     qua doi chieu.
 */
export type DestinationChoice =
  | { readonly kind: 'KNOWN_PLACE'; readonly placeId: string }
  | { readonly kind: 'VERIFIED_SEARCH'; readonly destination: ResolvedDestination };

/** KET CUC cua mot lenh thuong mai — doc tu su that SAU lenh, khong tu y dinh cua nguoi goi. */
export interface CommercialOutcome {
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly readiness: CommercialReadiness;
  readonly orderId: string | null;
  readonly orderCode: string | null;
  readonly bindingMode: SiteIntakeBindingMode | null;
  /** `true` khi CHINH lenh nay gan don (tao moi hoac gan don co san). */
  readonly bound: boolean;
  /** `true` khi lenh nay la mot lan GUI LAI — khong ghi gi them. */
  readonly replayed: boolean;
}

export interface ExceptionOutcome {
  readonly intakeId: string;
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly status: SiteIntakeCommercialStatus;
  readonly orderId: string | null;
  /** Xe da lan banh — vong chay, chang, moc, GPS giu nguyen. */
  readonly operationPreserved: boolean;
  readonly replayed: boolean;
}

export interface DriverDestinationCommand {
  readonly authUserId: string;
  readonly intakeId: string;
  readonly clientEventId: string;
  readonly choice: DestinationChoice;
}

export interface OfficeCompleteCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly idempotencyKey: string;
  readonly choice?: DestinationChoice;
  readonly attestOrigin?: boolean;
}

export interface BindExistingOrderCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly orderId: string;
}

export interface ReportExceptionCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/**
 * VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG — `#398`, phia LENH.
 *
 * ============================================================================================
 * BON LENH, MOT DUONG GHI
 * ============================================================================================
 *
 *   · lai xe chon diem giao        -> ghi diem giao, phan xu, DU thi tu tao don (`AUTO_CREATED`);
 *   · van phong hoan thien         -> ghi dieu con thieu, phan xu, DU thi tao don (`OFFICE_COMPLETED`);
 *   · van phong gan don co san     -> NGUOI chon don, don nhan chang (`OFFICE_EXISTING_ORDER`);
 *   · sep bao bat thuong / huy     -> may chu quyet huy den dau theo su that van hanh.
 *
 * Ca bon di qua `SiteIntakeCommercialStore.withIntake` — mot giao dich, ba khoa theo mot thu tu.
 * Khong lenh nao tao VONG CHAY hay CHANG: don NHAN vong chay + chang co hang ma lan xac nhan cua
 * lai xe (`#267`) da tao. Dem sau khi tu tao: vong chay +0, chang +0, don +1, ke hoach +1 (`ADOPTED`).
 *
 * ============================================================================================
 * KHONG MOT TRUONG TIEN NAO
 * ============================================================================================
 *
 * Don tu tao mang `freightAmount = null`, `customerId = null`: CHUA BIET, khong phai 0, khong phai
 * "khach = phap nhan cua kho". Lenh nay KHONG ghi cong no, khong ghi phai tra, khong duyet quyet
 * toan — `#398` §13: van hanh xong != giao xong don != doi soat != cong no != thanh toan.
 */
@Injectable()
export class SiteIntakeCommercialService {
  constructor(
    private readonly store: SiteIntakeCommercialStore,
    private readonly intakes: RunSiteIntakeRepository,
    private readonly core: TransportSiteIntakeCoreFacts,
    private readonly geo: TransportSiteIntakeGeoFacts,
    private readonly reader: SiteIntakeReadinessReader,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ------------------------------------------------------------------ *
   * LAI XE
   * ------------------------------------------------------------------ */

  /**
   * DIA DIEM GIAO DA BIET — hang rao dang hoat dong (bai xe, dia diem phap nhan, khach hang), cung
   * nguon voi "dia diem da biet" cua man tao don (#379). Chi DOC.
   */
  async knownDestinations(): Promise<{
    readonly available: true;
    readonly places: readonly KnownPlace[];
  }> {
    return { available: true, places: await this.geo.listKnownPlaces() };
  }

  /**
   * LAI XE CHON DIEM GIAO cho CHINH lan nhan viec cua minh.
   *
   * Danh tinh tu phien; lan nhan viec cua nguoi khac tra `SITE_INTAKE_NOT_FOUND` — CUNG ma voi mot
   * id khong co that, de khong ai do duoc id nao ton tai. Gui lai CUNG `clientEventId` tra ve dung
   * ket cuc cu (ke ca don da tao), khong ghi lan hai.
   */
  async chooseDestinationAsDriver(command: DriverDestinationCommand): Promise<CommercialOutcome> {
    const intake = await this.requireOwnIntake(command.authUserId, command.intakeId);
    const destination = await this.resolve(command.choice);

    return this.store.withIntake(intake.id, {}, async (scope) => {
      if (scope.commercial.destination?.eventId === command.clientEventId) {
        this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_DESTINATION_REPLAYED', {
          intakeId: intake.id,
        });
        return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
      }
      if (scope.commercial.status !== 'PENDING') {
        return this.outcomeOf(scope, await this.readinessIn(scope), false, false);
      }

      await this.recordDestination(scope, destination, {
        by: command.authUserId,
        role: 'DRIVER',
        eventId: command.clientEventId,
      });
      return this.settle(scope, command.authUserId, 'AUTO_CREATED');
    });
  }

  /* ------------------------------------------------------------------ *
   * VAN PHONG
   * ------------------------------------------------------------------ */

  /**
   * VAN PHONG HOAN THIEN: ghi dieu con thieu (diem giao, xac nhan noi lay), roi CUNG lenh tao don
   * neu da du. Chua du thi tra ve ly do — KHONG tao mot don OPEN chi de luong trong xong.
   */
  async completeAsOffice(command: OfficeCompleteCommand): Promise<CommercialOutcome> {
    const intake = await this.requireIntake(command.intakeId);
    const destination = command.choice ? await this.resolve(command.choice) : null;

    return this.store.withIntake(intake.id, {}, async (scope) => {
      if (scope.commercial.status !== 'PENDING') {
        return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
      }
      if (
        destination !== null &&
        scope.commercial.destination?.eventId !== command.idempotencyKey
      ) {
        await this.recordDestination(scope, destination, {
          by: command.actor,
          role: 'OFFICE',
          eventId: command.idempotencyKey,
        });
      }
      if (command.attestOrigin === true && scope.commercial.originAttestation === null) {
        const before = scope.commercial;
        const at = this.now();
        await scope.attestOrigin(command.actor, at);
        await scope.appendAudit({
          actor: command.actor,
          action: 'transport.site_intake.origin_attest',
          entityType: 'TransportSiteIntakeCommercial',
          entityId: scope.commercial.id,
          before,
          after: scope.commercial,
        });
      }
      return this.settle(scope, command.actor, 'OFFICE_COMPLETED');
    });
  }

  /**
   * GAN TAY MOT DON CO SAN — nguoi CHON don, may chu KHONG doan theo ten/gio (`#398` §6).
   *
   * Khoa tu van cua DON duoc gianh truoc khoa hang vong chay, cung khoa ma lan lap ke hoach gianh:
   * gan don nay vao chang cua lai xe va lap ke hoach cho don nay xep hang, khong chong len nhau.
   */
  async bindExistingOrder(command: BindExistingOrderCommand): Promise<CommercialOutcome> {
    const intake = await this.requireIntake(command.intakeId);

    return this.store.withIntake(intake.id, { lockOrderId: command.orderId }, async (scope) => {
      const target = await scope.findOrder(command.orderId);
      if (!target) {
        throw TransportDomainError.notFound('SITE_INTAKE_ORDER_NOT_FOUND', 'Khong tim thay don');
      }
      const planFacts = await scope.orderPlanFacts(target.id);
      const leg = this.legOf(scope);
      const decision = evaluateOrderBinding({
        status: scope.commercial.status,
        boundOrderId: scope.commercial.binding?.orderId ?? null,
        run: { status: scope.run.status },
        leg: { kind: leg.kind, status: leg.status, orderId: leg.orderId },
        runCarriesOtherOneOrderPlan: this.reader.facts(
          { ...scope, commercial: scope.commercial },
          { driver: null, driverVehicleId: null, site: null, originPoints: [] },
        ).runCarriesOtherOneOrderPlan,
        target: {
          id: target.id,
          status: target.status,
          hasActivePlan: planFacts.hasActivePlan,
          liveLegCount: planFacts.liveLegCount,
          boundToOtherIntake:
            planFacts.boundIntakeId !== null && planFacts.boundIntakeId !== scope.intake.id,
        },
      });

      if (decision.kind === 'ALREADY_BOUND') {
        this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_ALREADY_BOUND', {
          intakeId: scope.intake.id,
          orderId: decision.orderId,
        });
        return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
      }
      if (decision.kind === 'DENY') {
        this.decide('site_intake.commercial', 'denied', 'SITE_INTAKE_BINDING_DENIED', {
          intakeId: scope.intake.id,
          orderId: target.id,
          reason: decision.reason,
        });
        throw bindingDenied(decision.reason);
      }

      await this.adopt(scope, target, {
        actor: command.actor,
        mode: 'OFFICE_EXISTING_ORDER',
        destinationLabel: target.destinationLabel,
        created: false,
      });
      return this.outcomeOf(scope, await this.readinessIn(scope), true, false);
    });
  }

  /**
   * BAO BAT THUONG / HUY — ly do BAT BUOC, may chu quyet huy den dau (`#398` §9).
   *
   * KHONG xoa mot hang nao. Xe da lan banh thi vong chay, chang, moc, GPS, chung tu o nguyen; chi
   * phan THUONG MAI bi huy. Don da o trang thai cuoi thi chi GHI NHAN bat thuong — khong di vong qua
   * vong doi don bang mot lan sua trang thai truc tiep.
   */
  async reportException(command: ReportExceptionCommand): Promise<ExceptionOutcome> {
    const intake = await this.requireIntake(command.intakeId);

    return this.store.withIntake(intake.id, {}, async (scope) => {
      const leg = this.legOf(scope);
      const boundOrder = scope.commercial.binding
        ? await scope.findOrder(scope.commercial.binding.orderId)
        : null;
      const movementStarted = hasMovementStarted({
        runStatus: scope.run.status,
        legStatus: leg.status,
        checkpointTypes: await scope.checkpointTypes(),
      });
      const decision = decideException({
        status: scope.commercial.status,
        boundOrderStatus: boundOrder?.status ?? null,
        movementStarted,
        recorded: scope.commercial.exception ? { key: scope.commercial.exception.key } : null,
        key: command.idempotencyKey,
      });

      if (decision.kind === 'REPLAY') {
        this.decideException('allowed', 'SITE_INTAKE_EXCEPTION_REPLAYED', scope.intake.id, {});
        return this.exceptionOutcomeOf(scope.commercial, true);
      }
      if (decision.kind === 'DENY') {
        this.decideException(
          'denied',
          'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
          scope.intake.id,
          {},
        );
        throw TransportDomainError.conflict(
          'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
          'Viec nay da co mot lan bao bat thuong — mo lai de xem ket cuc',
        );
      }

      const at = this.now();
      const before = scope.commercial;

      if (decision.cancelOrder && boundOrder !== null) {
        const verdict = evaluateOrderCancel(boundOrder.status);
        if (!verdict.allowed) {
          throw TransportDomainError.conflict(
            'SITE_INTAKE_ORDER_NOT_OPEN',
            'Don vua doi trang thai — tai lai roi thu lai',
          );
        }
        const cancelled = await scope.cancelOrder(boundOrder.id, command.reason, at);
        await scope.appendAudit({
          actor: command.actor,
          action: 'transport.order.cancel',
          entityType: 'TransportOrder',
          entityId: boundOrder.id,
          before: boundOrder,
          after: {
            ...cancelled,
            source: 'DRIVER_SITE_INTAKE_EXCEPTION',
            intakeId: scope.intake.id,
          },
        });
      }

      if (decision.cancelWork) await this.cancelUnstartedWork(scope, command, at);

      await scope.recordException({
        reason: command.reason,
        outcome: decision.outcome,
        by: command.actor,
        at,
        key: command.idempotencyKey,
        reject: decision.rejectIntake,
      });
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.site_intake.exception',
        entityType: 'TransportSiteIntakeCommercial',
        entityId: scope.commercial.id,
        before,
        after: { ...scope.commercial, movementStarted },
      });
      this.decideException(
        'allowed',
        `SITE_INTAKE_EXCEPTION_${decision.outcome}` as SiteIntakeExceptionReason,
        scope.intake.id,
        { movementStarted, orderId: boundOrder?.id ?? null },
      );
      return this.exceptionOutcomeOf(scope.commercial, false);
    });
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  /**
   * PHAN XU roi, neu DU, TU TAO DON. Chay DUOI khoa cua `withIntake` — su that doc o day la ban
   * sau khi co khoa, nen hai lenh song song khong the cung thay "chua co don".
   */
  private async settle(
    scope: CommercialScope,
    actor: string,
    mode: 'AUTO_CREATED' | 'OFFICE_COMPLETED',
  ): Promise<CommercialOutcome> {
    const readiness = await this.readinessIn(scope);
    if (readiness.kind === 'READY_TO_AUTO_CREATE') {
      const at = this.now();
      const order = await scope.createOrder({
        code: siteIntakeOrderCode(scope.intake.businessDate, scope.intake.id),
        businessDate: scope.intake.businessDate,
        originLabel: readiness.origin.label,
        destinationLabel: readiness.destination.label,
        originPoint: readiness.origin.point,
        destinationPoint: readiness.destination.point,
        // CHUA BIET — khong doan, khong 0 (`#398` §4, §13).
        customerId: null,
        cargoDescription: null,
        freightAmount: null,
        note: null,
      });
      await scope.appendAudit({
        actor,
        action: 'transport.order.create',
        entityType: 'TransportOrder',
        entityId: order.id,
        before: null,
        after: { ...order, source: 'DRIVER_SITE_INTAKE', intakeId: scope.intake.id, mode },
      });
      await this.adopt(scope, order, {
        actor,
        mode,
        destinationLabel: readiness.destination.label,
        created: true,
        at,
      });
      return this.outcomeOf(scope, await this.readinessIn(scope), true, false);
    }

    this.decide(
      'site_intake.commercial',
      readiness.kind === 'REJECTED' ? 'denied' : 'allowed',
      readiness.kind === 'NEEDS_REVIEW'
        ? 'SITE_INTAKE_NEEDS_REVIEW'
        : readiness.kind === 'ALREADY_BOUND'
          ? 'SITE_INTAKE_ALREADY_BOUND'
          : 'SITE_INTAKE_COMMERCIAL_REJECTED',
      {
        intakeId: scope.intake.id,
        ...(readiness.kind === 'NEEDS_REVIEW' ? { reasons: readiness.reasons } : {}),
        ...(readiness.kind === 'REJECTED' ? { reason: readiness.reason } : {}),
      },
    );
    return this.outcomeOf(scope, readiness, false, false);
  }

  /**
   * DON NHAN VONG CHAY + CHANG CU — ba lan ghi, cung giao dich:
   *
   *   1. chang co hang cua lan nhan viec: `orderId` NULL -> don nay (co dieu kien, mot lan);
   *   2. ke hoach `ADOPTED` tro vao DUNG chang do — lan lap ke hoach sau cua don nay thay "da co ke
   *      hoach" (`TransportOrderRunPlan_activeOrder_key`) va KHONG tao vong chay/chang moi;
   *   3. phan thuong mai: `PENDING -> ORDER_BOUND`.
   */
  private async adopt(
    scope: CommercialScope,
    order: Order,
    context: {
      readonly actor: string;
      readonly mode: SiteIntakeBindingMode;
      readonly destinationLabel: string;
      readonly created: boolean;
      readonly at?: Date;
    },
  ): Promise<void> {
    const at = context.at ?? this.now();
    const leg = this.legOf(scope);
    const before = scope.commercial;

    const adopted = await scope.adoptLeg({
      legId: leg.id,
      orderId: order.id,
      destinationLabel: context.destinationLabel,
      at,
    });
    const plan = await scope.createAdoptionPlan({
      orderId: order.id,
      runId: scope.run.id,
      vehicleId: scope.run.vehicleId,
      loadedLegId: leg.id,
      emptyLegId: null,
      grouping: this.reader.grouping,
      outcome: 'ADOPTED',
      idempotencyKey: siteIntakePlanKey(scope.intake.id),
      plannedBy: context.actor,
      businessDate: scope.intake.businessDate,
    });
    await scope.markBound({ orderId: order.id, mode: context.mode, by: context.actor, at });

    await scope.appendAudit({
      actor: context.actor,
      action: 'transport.planning.adopt',
      entityType: 'TransportOrderRunPlan',
      entityId: plan.id,
      before: { leg },
      after: { plan, leg: adopted },
    });
    await scope.appendAudit({
      actor: context.actor,
      action: 'transport.site_intake.order_bound',
      entityType: 'TransportSiteIntakeCommercial',
      entityId: scope.commercial.id,
      before,
      after: {
        ...scope.commercial,
        runId: scope.run.id,
        legId: leg.id,
        driverId: scope.intake.driverId,
        vehicleId: scope.run.vehicleId,
        siteId: scope.intake.siteId,
      },
    });
    this.decide(
      'site_intake.commercial',
      'allowed',
      context.mode === 'AUTO_CREATED'
        ? 'SITE_INTAKE_ORDER_AUTO_CREATED'
        : context.mode === 'OFFICE_COMPLETED'
          ? 'SITE_INTAKE_ORDER_OFFICE_COMPLETED'
          : 'SITE_INTAKE_ORDER_BOUND_EXISTING',
      {
        intakeId: scope.intake.id,
        orderId: order.id,
        runId: scope.run.id,
        legId: leg.id,
        planId: plan.id,
        created: context.created,
      },
    );
  }

  /**
   * VIEC VAN HANH CHUA CHAY: ke hoach nhan lai, chang co hang, va vong chay — CHI khi vong chay
   * khong con viec nao KHAC dang song (che do nhieu don co the da noi chang cua don khac vao day).
   */
  private async cancelUnstartedWork(
    scope: CommercialScope,
    command: ReportExceptionCommand,
    at: Date,
  ): Promise<void> {
    const leg = this.legOf(scope);
    const plan = scope.activeRunPlans.find((entry) => entry.loadedLegId === leg.id);
    if (plan) {
      await scope.cancelActivePlan(plan.id, command.reason, at);
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.planning.cancel',
        entityType: 'TransportOrderRunPlan',
        entityId: plan.id,
        before: plan,
        after: { ...plan, cancelledAt: at.toISOString(), cancellationReason: command.reason },
      });
    }
    if (leg.status === 'PLANNED' && (await scope.cancelPlannedLeg(leg.id, at))) {
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.run.leg.cancel',
        entityType: 'TransportRunLeg',
        entityId: leg.id,
        before: leg,
        after: { ...leg, status: 'CANCELLED', reason: command.reason },
      });
    }
    const otherLiveWork = scope.legs.some(
      (entry) => entry.id !== leg.id && entry.status !== 'CANCELLED',
    );
    if (
      scope.run.status === 'PLANNED' &&
      !otherLiveWork &&
      (await scope.cancelPlannedRun(scope.run.id, command.reason, at))
    ) {
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.run.cancel',
        entityType: 'TransportVehicleRun',
        entityId: scope.run.id,
        before: scope.run,
        after: { ...scope.run, status: 'CANCELLED', cancellationReason: command.reason },
      });
    }
  }

  private async recordDestination(
    scope: CommercialScope,
    destination: ResolvedDestination,
    by: { readonly by: string; readonly role: SiteIntakeActorRole; readonly eventId: string },
  ): Promise<void> {
    const before = scope.commercial;
    await scope.setDestination({
      ...destination,
      setBy: by.by,
      setByRole: by.role,
      setAt: this.now(),
      eventId: by.eventId,
    });
    await scope.appendAudit({
      actor: by.by,
      action: 'transport.site_intake.destination',
      entityType: 'TransportSiteIntakeCommercial',
      entityId: scope.commercial.id,
      before,
      after: scope.commercial,
    });
    this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_DESTINATION_RECORDED', {
      intakeId: scope.intake.id,
      source: destination.source,
      role: by.role,
    });
  }

  private async readinessIn(scope: CommercialScope): Promise<CommercialReadiness> {
    return evaluateCommercialReadiness(
      this.reader.facts(scope, await this.reader.external(scope.intake)),
    );
  }

  private async outcomeOf(
    scope: CommercialScope,
    readiness: CommercialReadiness,
    bound: boolean,
    replayed: boolean,
  ): Promise<CommercialOutcome> {
    const orderId = scope.commercial.binding?.orderId ?? null;
    const order = orderId === null ? null : await scope.findOrder(orderId);
    return {
      intakeId: scope.intake.id,
      status: scope.commercial.status,
      readiness,
      orderId,
      orderCode: order?.code ?? null,
      bindingMode: scope.commercial.binding?.mode ?? null,
      bound,
      replayed,
    };
  }

  private exceptionOutcomeOf(
    commercial: SiteIntakeCommercial,
    replayed: boolean,
  ): ExceptionOutcome {
    const outcome = commercial.exception?.outcome ?? 'ANOMALY_RECORDED_ORDER_TERMINAL';
    return {
      intakeId: commercial.intakeId,
      outcome,
      status: commercial.status,
      orderId: commercial.binding?.orderId ?? null,
      operationPreserved:
        outcome === 'ORDER_CANCELLED_OPERATION_PRESERVED' ||
        outcome === 'INTAKE_REJECTED_OPERATION_PRESERVED',
      replayed,
    };
  }

  /** Giai lua chon diem giao thanh su that vi tri DO MAY CHU doc — ngoai khoa, chi doc. */
  private async resolve(choice: DestinationChoice): Promise<ResolvedDestination> {
    if (choice.kind === 'VERIFIED_SEARCH') return choice.destination;
    const place = (await this.geo.listKnownPlaces()).find((entry) => entry.id === choice.placeId);
    if (!place) {
      throw TransportDomainError.notFound(
        'SITE_INTAKE_DESTINATION_NOT_FOUND',
        'Khong tim thay dia diem giao dang hoat dong nao mang ma do',
      );
    }
    return {
      label: place.detail ? `${place.detail} — ${place.name}` : place.name,
      point: place.point,
      source: 'KNOWN_PLACE',
      ref: place.id,
    };
  }

  private legOf(scope: CommercialScope) {
    const leg = scope.legs.find((entry) => entry.id === scope.intake.legId);
    if (!leg) {
      throw TransportDomainError.conflict(
        'SITE_INTAKE_LEG_NOT_ADOPTABLE',
        'Chang cua lan nhan viec khong con doc duoc',
      );
    }
    return leg;
  }

  private async requireIntake(intakeId: string): Promise<RunSiteIntake> {
    const intake = await this.intakes.findById(intakeId);
    if (!intake) {
      throw TransportDomainError.notFound('SITE_INTAKE_NOT_FOUND', 'Khong tim thay lan nhan viec');
    }
    return intake;
  }

  /** Lan nhan viec CUA CHINH lai xe dang goi — nguoi khac va khong co that tra CUNG mot ma. */
  private async requireOwnIntake(authUserId: string, intakeId: string): Promise<RunSiteIntake> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    const intake = await this.intakes.findById(intakeId);
    if (!driver || !intake || intake.driverId !== driver.id) {
      throw TransportDomainError.notFound('SITE_INTAKE_NOT_FOUND', 'Khong tim thay lan nhan viec');
    }
    return intake;
  }

  private decide(
    point: 'site_intake.commercial',
    outcome: 'allowed' | 'denied',
    reason: SiteIntakeCommercialReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SITE_INTAKE_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }

  private decideException(
    outcome: 'allowed' | 'denied',
    reason: SiteIntakeExceptionReason,
    intakeId: string,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SITE_INTAKE_DECISIONS,
      point: 'site_intake.exception',
      outcome,
      reason,
      detail: { intakeId, ...detail },
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/** Ma gan don co san -> ma HTTP co ten, 409 — mot va cham trang thai, khong phai thieu quyen. */
function bindingDenied(reason: SiteIntakeBindingDenyReason): TransportDomainError {
  switch (reason) {
    case 'INTAKE_BOUND_TO_OTHER_ORDER':
      return TransportDomainError.conflict(
        'SITE_INTAKE_BOUND_TO_OTHER_ORDER',
        'Viec nay da gan mot don khac — khong gan lai duoc',
      );
    case 'ORDER_BOUND_TO_OTHER_INTAKE':
      return TransportDomainError.conflict(
        'SITE_INTAKE_ORDER_BOUND_TO_OTHER_INTAKE',
        'Don nay da nhan mot viec tai xe khac',
      );
    case 'ORDER_NOT_OPEN':
      return TransportDomainError.conflict('SITE_INTAKE_ORDER_NOT_OPEN', 'Don khong con mo');
    default:
      return TransportDomainError.conflict(
        'SITE_INTAKE_BINDING_DENIED',
        `Khong gan duoc don nay vao viec nay (${reason})`,
      );
  }
}

/** Hai diem trung nhau (duoi mot met) — dung o tang doi chieu ket qua tim dia diem. */
export const samePoint = (
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): boolean => greatCircleMetres(left, right) < 1;
