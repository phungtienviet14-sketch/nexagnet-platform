import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { StateChangeRecord, TelemetryRecord } from '../../observability/telemetry-record.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryCounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { InMemoryRunPlanRepository } from '../planning/planning.repository.js';
import { PlanningService } from '../planning/planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from '../planning/planning.types.js';
import { InMemoryGeofenceRepository } from '../proof/geofence.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { siteIntakeOrderCode, siteIntakePlanKey } from './commercial-readiness.js';
import { SiteIntakePlanningPendingWorkSource } from './site-intake-composition.adapters.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import { MovementSiteIntakeConfirmationWriter } from './site-intake-confirmation.writer.js';
import { InMemorySiteIntakeCommercialStore } from './site-intake-commercial.store.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';
import { InMemoryRunSiteIntakeRepository } from './site-intake.repository.js';
import {
  bindExistingOrderSchema,
  driverDestinationSchema,
  officeCompleteSchema,
  reportExceptionSchema,
} from './site-intake.schemas.js';
import { SiteIntakeService } from './site-intake.service.js';

/**
 * VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG — `#398`, tang dich vu TRONG BO NHO.
 *
 * Bo nay chay CHINH cac dich vu va kho trong bo nho ma `PERSISTENCE=memory` dung: xac nhan cua
 * `#267`, phan thuong mai, lap ke hoach `#276`. Moi bai khang dinh bang SO DEM va DINH DANH (vong
 * chay +0, chang +0, don +1, cung id), khong bang mot co `ok`.
 *
 * Bang chung DONG THOI (hai giao dich cung luc, khoa tu van, trigger) nam o
 * `transport-site-intake-commercial.int.spec.ts` — ban trong bo nho xep hang moi lenh qua mot hang
 * doi, nen o day chi chung minh duong tuan tu.
 */

const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const ORIGIN = { latitude: 21.35, longitude: 106.35 };
const DESTINATION = { latitude: 21.03, longitude: 105.85 };
const AUTH = 'lai-xe-mot';
const OTHER_AUTH = 'lai-xe-hai';
const OFFICE = 'ke-toan';

class NoLocationFacts extends TransportSiteIntakeLocationFacts {
  async findObservation(): Promise<SiteIntakeObservationFacts | null> {
    return null;
  }
}

const planningPolicy = (grouping: RunGrouping): TransportPlanningPolicy => ({
  grouping,
  depots: [{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  return 'KHONG-NEM';
};

describe.each(['ONE_ORDER_PER_RUN', 'MULTI_ORDER_RUN'] as const)(
  'SiteIntakeCommercialService trong bo nho — #398 (%s)',
  (grouping) => {
    let fleet: InMemoryFleetRepository;
    let movementRepo: InMemoryMovementRepository;
    let plans: InMemoryRunPlanRepository;
    let auditRepo: InMemoryAuditLogRepository;
    let movement: MovementService;
    let intakes: InMemoryRunSiteIntakeRepository;
    let intakeService: SiteIntakeService;
    let commercial: SiteIntakeCommercialService;
    let review: SiteIntakeReviewService;
    let planning: PlanningService;
    let pendingWork: SiteIntakePlanningPendingWorkSource;
    /** Cac mien ghep cua `commercial` — de dung lai MOT ban co telemetry trong bai observability. */
    let wiring: {
      store: InMemorySiteIntakeCommercialStore;
      core: TransportSiteIntakeCoreFactsAdapter;
      geo: TransportSiteIntakeGeoFactsAdapter;
      reader: SiteIntakeReadinessReader;
    };

    let siteId = '';
    let destinationPlaceId = '';
    let vehicleId = '';
    let otherVehicleId = '';

    beforeEach(async () => {
      fleet = new InMemoryFleetRepository();
      movementRepo = new InMemoryMovementRepository();
      plans = new InMemoryRunPlanRepository();
      auditRepo = new InMemoryAuditLogRepository();
      const audit = new AuditLogService(auditRepo);
      movement = new MovementService(movementRepo, fleet, audit, POLICY);
      intakes = new InMemoryRunSiteIntakeRepository();

      const sites = new InMemoryCounterpartySiteRepository();
      const counterparties = new InMemoryCounterpartyRepository();
      const geofences = new InMemoryGeofenceRepository();
      const siteService = new CounterpartySiteService(sites, counterparties);
      const core = new TransportSiteIntakeCoreFactsAdapter(fleet, movementRepo, siteService);
      const geo = new TransportSiteIntakeGeoFactsAdapter(geofences, siteService);
      const policy = planningPolicy(grouping);

      intakeService = new SiteIntakeService(
        intakes,
        core,
        geo,
        new NoLocationFacts(),
        movement,
        new MovementSiteIntakeConfirmationWriter(movement, intakes, core),
        POLICY,
      );
      const store = new InMemorySiteIntakeCommercialStore(intakes, movementRepo, plans, audit);
      const reader = new SiteIntakeReadinessReader(core, geo, policy);
      commercial = new SiteIntakeCommercialService(store, intakes, core, geo, reader);
      review = new SiteIntakeReviewService(store, intakes, movementRepo, plans, core, reader);
      wiring = { store, core, geo, reader };
      pendingWork = new SiteIntakePlanningPendingWorkSource(review);
      planning = new PlanningService(movement, plans, fleet, audit, POLICY, policy);

      const party = await counterparties.create({ name: 'Cong ty ABC' });
      siteId = (
        await sites.create({
          counterpartyId: party.id,
          name: 'Kho A',
          address: null,
          note: null,
          status: 'ACTIVE',
          recordedBy: OFFICE,
        })
      ).id;
      await geofences.register({
        label: 'Kho A',
        subjectKind: 'COUNTERPARTY_SITE',
        subjectId: siteId,
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        radiusMetres: 300,
        note: null,
        recordedBy: OFFICE,
      });
      destinationPlaceId = (
        await geofences.register({
          label: 'Bai xe B',
          subjectKind: 'DEPOT',
          subjectId: 'BAI-B',
          latitude: DESTINATION.latitude,
          longitude: DESTINATION.longitude,
          radiusMetres: 200,
          note: null,
          recordedBy: OFFICE,
        })
      ).id;

      vehicleId = (await aVehicleWithDriver('15C-11111', AUTH)).vehicleId;
      otherVehicleId = (await aVehicleWithDriver('15C-22222', OTHER_AUTH)).vehicleId;
    });

    const aVehicleWithDriver = async (plate: string, authUserId: string) => {
      const vehicle = await fleet.createVehicle({
        registrationPlate: plate,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `Lai xe ${plate}`,
        phone: `09${plate.replace(/\D/g, '')}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return { vehicleId: vehicle.id, driverId: driver.id };
    };

    /** Tai xe bam "Nhan chuyen tai day" — vi tri NAM TRONG hang rao cua kho A. */
    const confirm = (over: Record<string, unknown> = {}) =>
      intakeService.confirm({
        authUserId: AUTH,
        siteId,
        clientEventId: 'cham-mot',
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        accuracyMetres: 10,
        ...over,
      } as Parameters<SiteIntakeService['confirm']>[0]);

    const chooseDestination = (intakeId: string, clientEventId = 'diem-giao-1', auth = AUTH) =>
      commercial.chooseDestinationAsDriver({
        authUserId: auth,
        intakeId,
        clientEventId,
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });

    const counts = async () => {
      const runs = await movementRepo.listRuns();
      const legs = (await Promise.all(runs.map((run) => movementRepo.listLegs(run.id)))).flat();
      return {
        runs: runs.length,
        legs: legs.length,
        orders: (await movementRepo.listOrders()).length,
      };
    };

    const auditActions = async (entityId: string) =>
      (await auditRepo.list({ entityId, limit: 200 })).map((entry) => entry.action);

    const anOrder = (code: string) =>
      movement.createOrder(
        { code, originLabel: 'Cong ty ABC — Kho A', destinationLabel: 'Bai xe B' },
        OFFICE,
      );

    /* ================================================================ *
     * TU TAO DON
     * ================================================================ */

    it('tai xe chon diem giao da biet -> MOT don, nhan DUNG vong chay + chang cu', async () => {
      const intake = await confirm();
      const row = await intakes.findById(intake.intakeId);
      expect(row?.siteMatch).toBe('UNIQUE_INSIDE');
      const before = await counts();

      const outcome = await chooseDestination(intake.intakeId);

      expect(outcome).toMatchObject({
        status: 'ORDER_BOUND',
        bindingMode: 'AUTO_CREATED',
        bound: true,
        replayed: false,
        readiness: { kind: 'ALREADY_BOUND' },
      });
      expect(await counts()).toEqual({ ...before, orders: before.orders + 1 });

      const order = await movement.getOrder(outcome.orderId ?? '');
      expect(order.code).toBe(siteIntakeOrderCode(intake.businessDate, intake.intakeId));
      expect(outcome.orderCode).toBe(order.code);
      // Tien CHUA BIET: null, khong bao gio 0; khach CHUA BIET: null, khong doan.
      expect(order.freightAmount).toBeNull();
      expect(order.customerId).toBeNull();
      expect(order.status).toBe('OPEN');
      expect(order.originLabel).toBe('Cong ty ABC — Kho A');
      expect(order.originPoint).toEqual(ORIGIN);
      expect(order.destinationLabel).toBe('Bai xe B');
      expect(order.destinationPoint).toEqual(DESTINATION);

      const legs = await movementRepo.listLegs(intake.runId);
      expect(legs.map((leg) => leg.id)).toEqual([intake.legId]);
      expect(legs[0]?.orderId).toBe(order.id);
      expect(legs[0]?.destinationLabel).toBe('Bai xe B');

      const plan = await plans.findActiveForOrder(order.id);
      expect(plan).toMatchObject({
        runId: intake.runId,
        vehicleId,
        loadedLegId: intake.legId,
        emptyLegId: null,
        outcome: 'ADOPTED',
        grouping,
        idempotencyKey: siteIntakePlanKey(intake.intakeId),
      });

      expect(await auditActions(order.id)).toContain('transport.order.create');
      expect(await auditActions(plan?.id ?? '')).toContain('transport.planning.adopt');
      const bound = (await auditRepo.list({ action: 'transport.site_intake.order_bound' }))[0];
      expect(bound?.after).toMatchObject({
        binding: { orderId: order.id, mode: 'AUTO_CREATED' },
        runId: intake.runId,
        legId: intake.legId,
      });
    });

    it('gui lai CUNG clientEventId -> dung don cu, khong don thu hai', async () => {
      const intake = await confirm();
      const first = await chooseDestination(intake.intakeId);
      const after = await counts();

      const replay = await chooseDestination(intake.intakeId);
      expect(replay).toMatchObject({ orderId: first.orderId, replayed: true, bound: false });
      // Khoa KHAC sau khi da gan don: khong ghi gi, van cung don.
      const late = await chooseDestination(intake.intakeId, 'diem-giao-2');
      expect(late).toMatchObject({ orderId: first.orderId, bound: false, status: 'ORDER_BOUND' });
      expect(await counts()).toEqual(after);
      expect((await auditRepo.list({ action: 'transport.order.create' })).length).toBe(1);
    });

    /**
     * MAT PHAN HOI roi gui lai CUNG khoa: lan gui lai KHONG duoc phu thuoc vao viec tim dia diem con
     * chay — bo nho dem cua lan tim da mat (khoi dong lai, may khac) hoac nha cung cap dang ban. Lua
     * chon den duoi dang HAM; lan gui lai khong goi no.
     */
    const searchDown = () => {
      let calls = 0;
      return {
        calls: () => calls,
        choice: async (): Promise<never> => {
          calls += 1;
          throw TransportDomainError.conflict('SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE', 'ban');
        },
      };
    };

    it('tai xe gui lai CUNG khoa khi tim dia diem dang ban -> ket cuc cu, KHONG tim lai', async () => {
      const intake = await confirm();
      const first = await commercial.chooseDestinationAsDriver({
        authUserId: AUTH,
        intakeId: intake.intakeId,
        clientEventId: 'diem-giao-1',
        choice: async () => ({ kind: 'KNOWN_PLACE', placeId: destinationPlaceId }),
      });
      const after = await counts();
      const down = searchDown();

      const replay = await commercial.chooseDestinationAsDriver({
        authUserId: AUTH,
        intakeId: intake.intakeId,
        clientEventId: 'diem-giao-1',
        choice: down.choice,
      });
      expect(replay).toMatchObject({ orderId: first.orderId, replayed: true, bound: false });
      // Viec da dong + khoa KHAC: cung khong can diem giao moi, khong tim lai.
      const late = await commercial.chooseDestinationAsDriver({
        authUserId: AUTH,
        intakeId: intake.intakeId,
        clientEventId: 'diem-giao-2',
        choice: down.choice,
      });
      expect(late).toMatchObject({ orderId: first.orderId, status: 'ORDER_BOUND', bound: false });
      expect(down.calls()).toBe(0);
      expect(await counts()).toEqual(after);
    });

    it('van phong gui lai CUNG khoa khi tim dia diem dang ban -> ket cuc cu, KHONG tim lai', async () => {
      const intake = await confirm();
      const office = await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: intake.intakeId,
        idempotencyKey: 'hoan-thien-1',
        choice: async () => ({ kind: 'KNOWN_PLACE', placeId: destinationPlaceId }),
      });
      expect(office).toMatchObject({ status: 'ORDER_BOUND', bound: true });
      const after = await counts();
      const down = searchDown();

      const again = await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: intake.intakeId,
        idempotencyKey: 'hoan-thien-1',
        choice: down.choice,
      });
      expect(again).toMatchObject({ orderId: office.orderId, replayed: true, bound: false });
      expect(down.calls()).toBe(0);
      expect(await counts()).toEqual(after);

      // Lan dau (chua co gi) thi VAN tim: loi tim dia diem di len nguyen, khong ghi gi.
      const fresh = await confirm({ authUserId: OTHER_AUTH, clientEventId: 'cham-hai' });
      const other = searchDown();
      expect(
        await reasonOf(() =>
          commercial.completeAsOffice({
            actor: OFFICE,
            intakeId: fresh.intakeId,
            idempotencyKey: 'hoan-thien-2',
            choice: other.choice,
          }),
        ),
      ).toBe('SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE');
      expect(other.calls()).toBe(1);
    });

    it('chua co diem giao -> PENDING, NEEDS_REVIEW DESTINATION_MISSING, khong don', async () => {
      const intake = await confirm();
      const view = await review.detail(intake.intakeId);
      expect(view.status).toBe('PENDING');
      expect(view.readiness).toEqual({
        kind: 'NEEDS_REVIEW',
        reasons: ['DESTINATION_MISSING'],
        rejectedReason: null,
      });
      expect((await movementRepo.listOrders()).length).toBe(0);
    });

    it('diem giao khong co that -> tu choi, van PENDING, khong don', async () => {
      const intake = await confirm();
      expect(
        await reasonOf(() =>
          commercial.chooseDestinationAsDriver({
            authUserId: AUTH,
            intakeId: intake.intakeId,
            clientEventId: 'diem-giao-ma',
            choice: { kind: 'KNOWN_PLACE', placeId: 'khong-co-that' },
          }),
        ),
      ).toBe('SITE_INTAKE_DESTINATION_NOT_FOUND');
      const view = await review.detail(intake.intakeId);
      expect(view.status).toBe('PENDING');
      expect(view.destination).toBeNull();
      expect(view.readiness.reasons).toEqual(['DESTINATION_MISSING']);
      expect((await movementRepo.listOrders()).length).toBe(0);
    });

    it('viec cua tai xe KHAC va id khong co that tra CUNG mot ma', async () => {
      const intake = await confirm();
      expect(await reasonOf(() => chooseDestination(intake.intakeId, 'x', OTHER_AUTH))).toBe(
        'SITE_INTAKE_NOT_FOUND',
      );
      expect(await reasonOf(() => chooseDestination('khong-co-that'))).toBe(
        'SITE_INTAKE_NOT_FOUND',
      );
      expect((await movementRepo.listOrders()).length).toBe(0);
    });

    /* ================================================================ *
     * VAN PHONG
     * ================================================================ */

    it('xac nhan KHONG kem vi tri: tai xe chon diem giao chua du, van phong xac nhan noi lay moi tao don', async () => {
      const intake = await confirm({
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
      });
      expect((await intakes.findById(intake.intakeId))?.siteMatch).toBe('NO_LOCATION');

      const driverOutcome = await chooseDestination(intake.intakeId);
      expect(driverOutcome).toMatchObject({
        status: 'PENDING',
        bound: false,
        orderId: null,
        readiness: { kind: 'NEEDS_REVIEW', reasons: ['ORIGIN_LOCATION_UNVERIFIED'] },
      });
      expect((await review.detail(intake.intakeId)).actions.canAttestOrigin).toBe(true);

      const withoutAttest = await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: intake.intakeId,
        idempotencyKey: 'hoan-thien-0',
      });
      expect(withoutAttest.bound).toBe(false);
      expect((await movementRepo.listOrders()).length).toBe(0);

      const office = await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: intake.intakeId,
        idempotencyKey: 'hoan-thien-1',
        attestOrigin: true,
      });
      expect(office).toMatchObject({
        status: 'ORDER_BOUND',
        bindingMode: 'OFFICE_COMPLETED',
        bound: true,
      });
      expect((await movementRepo.listOrders()).length).toBe(1);
      expect((await auditRepo.list({ action: 'transport.site_intake.origin_attest' })).length).toBe(
        1,
      );

      const again = await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: intake.intakeId,
        idempotencyKey: 'hoan-thien-1',
        attestOrigin: true,
      });
      expect(again).toMatchObject({ orderId: office.orderId, replayed: true, bound: false });
      expect((await movementRepo.listOrders()).length).toBe(1);
    });

    it('gan don co san: X -> X khong doi, X -> Y bi tu choi', async () => {
      const intake = await confirm();
      const x = await anOrder('DH-X');
      const y = await anOrder('DH-Y');
      const before = await counts();

      const bound = await commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: intake.intakeId,
        orderId: x.id,
      });
      expect(bound).toMatchObject({
        status: 'ORDER_BOUND',
        bindingMode: 'OFFICE_EXISTING_ORDER',
        orderId: x.id,
        bound: true,
      });
      expect(await counts()).toEqual(before);
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBe(x.id);
      expect((await plans.findActiveForOrder(x.id))?.outcome).toBe('ADOPTED');

      const replay = await commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: intake.intakeId,
        orderId: x.id,
      });
      expect(replay).toMatchObject({ orderId: x.id, replayed: true, bound: false });

      expect(
        await reasonOf(() =>
          commercial.bindExistingOrder({ actor: OFFICE, intakeId: intake.intakeId, orderId: y.id }),
        ),
      ).toBe('SITE_INTAKE_BOUND_TO_OTHER_ORDER');
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBe(x.id);
      expect(await plans.findActiveForOrder(y.id)).toBeNull();
    });

    it('don DA co ke hoach o xe khac khong gan duoc vao viec tai xe', async () => {
      const intake = await confirm();
      const z = await anOrder('DH-Z');
      await planning.commit(z.id, { vehicleId: otherVehicleId, idempotencyKey: 'plan-z' }, OFFICE);

      expect(
        await reasonOf(() =>
          commercial.bindExistingOrder({ actor: OFFICE, intakeId: intake.intakeId, orderId: z.id }),
        ),
      ).toBe('SITE_INTAKE_BINDING_DENIED');
      expect((await review.detail(intake.intakeId)).status).toBe('PENDING');
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBeNull();
    });

    /** Don co san mang TOA DO diem lay (#379) — tao qua dung duong van phong tao don. */
    const anOrderAt = (code: string, originPoint: { latitude: number; longitude: number }) =>
      movement.createOrder(
        {
          code,
          originLabel: 'Kho nao do',
          destinationLabel: 'Bai xe B',
          originPoint,
          destinationPoint: DESTINATION,
        },
        OFFICE,
      );

    /** ~2 km ve phia bac tam hang rao kho A — ngoai dung sai doi chieu diem lay. */
    const FAR_FROM_ORIGIN = { latitude: ORIGIN.latitude + 0.018, longitude: ORIGIN.longitude };

    it('don co san lay hang o NOI KHAC: khong nam trong danh sach gan duoc, gan tay thi SITE_INTAKE_ORDER_ORIGIN_MISMATCH', async () => {
      const intake = await confirm();
      const far = await anOrderAt('DH-XA', FAR_FROM_ORIGIN);
      await anOrderAt('DH-GAN', ORIGIN);
      await anOrder('DH-KHONG-TOA-DO');

      const bindable = (await review.bindableOrders(intake.intakeId)).map((order) => order.code);
      expect(bindable).toContain('DH-GAN');
      // Don KHONG co toa do van de nghi: nguoi chon tu chiu, khong co gi de chung minh la lech.
      expect(bindable).toContain('DH-KHONG-TOA-DO');
      expect(bindable).not.toContain('DH-XA');

      const before = await counts();
      expect(
        await reasonOf(() =>
          commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: intake.intakeId,
            orderId: far.id,
          }),
        ),
      ).toBe('SITE_INTAKE_ORDER_ORIGIN_MISMATCH');
      expect(await counts()).toEqual(before);
      expect((await review.detail(intake.intakeId)).status).toBe('PENDING');
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBeNull();
      expect(await plans.findActiveForOrder(far.id)).toBeNull();
    });

    it('don co san lay hang TAI CHINH kho do: gan duoc, don nhan dung vong chay + chang cu', async () => {
      const intake = await confirm();
      const near = await anOrderAt('DH-GAN', ORIGIN);
      const before = await counts();

      const bound = await commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: intake.intakeId,
        orderId: near.id,
      });
      expect(bound).toMatchObject({
        status: 'ORDER_BOUND',
        bindingMode: 'OFFICE_EXISTING_ORDER',
        orderId: near.id,
        bound: true,
      });
      expect(await counts()).toEqual(before);
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBe(near.id);
    });

    /* ================================================================ *
     * TRINH SUA VONG CHAY / CHANG TAY
     * ================================================================ */

    it('don TU TAO tu viec tai xe khong len duoc chang co hang THU HAI qua trinh sua tay', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const orderId = outcome.orderId ?? '';
      const manualRun = await movement.createRun(
        { code: 'RUN-TAY-398', vehicleId: otherVehicleId },
        OFFICE,
      );
      const before = await counts();

      expect(
        await reasonOf(() =>
          movement.addLeg(
            manualRun.id,
            {
              sequence: 1,
              kind: 'LOADED',
              orderId,
              originLabel: 'Cong ty ABC — Kho A',
              destinationLabel: 'Bai xe B',
            },
            OFFICE,
          ),
        ),
      ).toBe('LEG_ORDER_ADOPTED_BY_SITE_INTAKE');
      expect(await counts()).toEqual(before);
      expect((await movementRepo.listLegsByOrder(orderId)).map((leg) => leg.id)).toEqual([
        intake.legId,
      ]);
    });

    /* ================================================================ *
     * VAN PHONG HUY KE HOACH ADOPTED — cong chan chang THU HAI, khong chan chang THAY THE
     * ================================================================ */

    const liveLoadedLegs = async (orderId: string) =>
      (await movementRepo.listLegsByOrder(orderId)).filter(
        (leg) => leg.kind === 'LOADED' && leg.status !== 'CANCELLED',
      );

    const runsOf = async (vehicle: string) =>
      (await movementRepo.listRuns()).filter((run) => run.vehicleId === vehicle);

    it('xe CHUA chay: huy ke hoach ADOPTED roi lap lai cho xe khac -> DUNG mot chang co hang song, khong vong chay mo coi', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const orderId = outcome.orderId ?? '';
      const adopted = await plans.findActiveForOrder(orderId);

      await planning.cancelPlan(adopted?.id ?? '', 'Doi xe khac', OFFICE);
      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('CANCELLED');

      const replanned = await planning.commit(
        orderId,
        { vehicleId: otherVehicleId, idempotencyKey: 'plan-lai', pendingWork },
        OFFICE,
      );

      const live = await liveLoadedLegs(orderId);
      expect(live).toHaveLength(1);
      expect(live[0]?.id).toBe(replanned.plan.loadedLegId);
      expect(live[0]?.id).not.toBe(intake.legId);
      expect(replanned.run.vehicleId).toBe(otherVehicleId);
      expect((await plans.findActiveForOrder(orderId))?.id).toBe(replanned.plan.id);
    });

    it('xe DA chay: huy ke hoach ADOPTED roi lap lai -> tu choi TRUOC moi lan ghi, khong vong chay/chang mo coi', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const orderId = outcome.orderId ?? '';
      const adopted = await plans.findActiveForOrder(orderId);
      await movement.transitionLeg(intake.legId, 'IN_TRANSIT', AUTH);

      // Chang dang chay thi `cancelPlan` giu nguyen chang, chi huy ke hoach.
      await planning.cancelPlan(adopted?.id ?? '', 'Nham ke hoach', OFFICE);
      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('IN_TRANSIT');
      const before = await counts();

      for (const key of ['plan-lai-1', 'plan-lai-2']) {
        expect(
          await reasonOf(() =>
            planning.commit(
              orderId,
              { vehicleId: otherVehicleId, idempotencyKey: key, pendingWork },
              OFFICE,
            ),
          ),
        ).toBe('LEG_ORDER_ADOPTED_BY_SITE_INTAKE');
      }
      expect(await counts()).toEqual(before);
      expect(await runsOf(otherVehicleId)).toEqual([]);
      expect((await liveLoadedLegs(orderId)).map((leg) => leg.id)).toEqual([intake.legId]);
    });

    /* ================================================================ *
     * OBSERVABILITY — chuyen trang thai + buoc nghiep vu
     * ================================================================ */

    const RELEASE = {
      tenant: 'it',
      environment: 'test',
      gitSha: 'unknown',
      source: 'none',
    } as const;

    const withTelemetry = () => {
      const records: TelemetryRecord[] = [];
      const telemetry = new TelemetryService();
      telemetry.configure({
        release: RELEASE,
        privacy: 'full',
        sinks: [{ record: (record) => records.push(record) }],
      });
      const service = new SiteIntakeCommercialService(
        wiring.store,
        intakes,
        wiring.core,
        wiring.geo,
        wiring.reader,
        telemetry,
      );
      const stateChanges = () =>
        records
          .filter((record): record is StateChangeRecord => record.type === 'state_change')
          .map(({ entity, entityId, from, to, reason }) => ({
            entity,
            entityId,
            from,
            to,
            reason,
          }));
      const steps = () =>
        records.flatMap((record) => (record.type === 'step' ? [record.name] : []));
      return { service, stateChanges, steps };
    };

    it('tu tao don: stateChange Order null->OPEN va phan thuong mai PENDING->ORDER_BOUND, trong cac buoc site_intake.*', async () => {
      const intake = await confirm();
      const { service, stateChanges, steps } = withTelemetry();
      const choose = () =>
        service.chooseDestinationAsDriver({
          authUserId: AUTH,
          intakeId: intake.intakeId,
          clientEventId: 'diem-giao-1',
          choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
        });

      const outcome = await choose();

      const commercialRow = await wiring.store.findByIntake(intake.intakeId);
      expect(stateChanges()).toEqual([
        {
          entity: 'TransportOrder',
          entityId: outcome.orderId,
          from: null,
          to: 'OPEN',
          reason: 'AUTO_CREATED',
        },
        {
          entity: 'TransportSiteIntakeCommercial',
          entityId: commercialRow?.id,
          from: 'PENDING',
          to: 'ORDER_BOUND',
          reason: 'AUTO_CREATED',
        },
      ]);
      // Buoc trong ket thuc (va ghi) truoc buoc ngoai.
      expect(steps()).toEqual([
        'site_intake.adopt',
        'site_intake.settle',
        'site_intake.driver_destination',
      ]);

      // Gui lai: khong chuyen trang thai nao moi.
      await choose();
      expect(stateChanges()).toHaveLength(2);
    });

    it('lenh bi tu choi khong phat chuyen trang thai; bao bat thuong PENDING->REJECTED kem huy chang + vong chay', async () => {
      const intake = await confirm();
      const { service, stateChanges, steps } = withTelemetry();
      const far = await anOrderAt('DH-XA', FAR_FROM_ORIGIN);

      expect(
        await reasonOf(() =>
          service.bindExistingOrder({ actor: OFFICE, intakeId: intake.intakeId, orderId: far.id }),
        ),
      ).toBe('SITE_INTAKE_ORDER_ORIGIN_MISMATCH');
      expect(stateChanges()).toEqual([]);
      expect(steps()).toEqual(['site_intake.bind_existing_order']);

      await service.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Tai xe bam nham kho',
        idempotencyKey: 'bat-thuong-1',
      });
      const commercialRow = await wiring.store.findByIntake(intake.intakeId);
      const reason = 'INTAKE_REJECTED_WORK_CANCELLED';
      expect(stateChanges()).toEqual([
        {
          entity: 'TransportRunLeg',
          entityId: intake.legId,
          from: 'PLANNED',
          to: 'CANCELLED',
          reason,
        },
        {
          entity: 'TransportVehicleRun',
          entityId: intake.runId,
          from: 'PLANNED',
          to: 'CANCELLED',
          reason,
        },
        {
          entity: 'TransportSiteIntakeCommercial',
          entityId: commercialRow?.id,
          from: 'PENDING',
          to: 'REJECTED',
          reason,
        },
      ]);
    });

    it('telemetry hong KHONG lam hong nghiep vu (fail-open)', async () => {
      const intake = await confirm();
      const telemetry = new TelemetryService();
      telemetry.configure({
        release: RELEASE,
        privacy: 'full',
        sinks: [
          {
            record: () => {
              throw new Error('sink chet');
            },
          },
        ],
      });
      const service = new SiteIntakeCommercialService(
        wiring.store,
        intakes,
        wiring.core,
        wiring.geo,
        wiring.reader,
        telemetry,
      );

      const outcome = await service.chooseDestinationAsDriver({
        authUserId: AUTH,
        intakeId: intake.intakeId,
        clientEventId: 'diem-giao-1',
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });
      expect(outcome).toMatchObject({ status: 'ORDER_BOUND', bound: true });
    });

    /* ================================================================ *
     * LAP KE HOACH SAU DO
     * ================================================================ */

    it('lap ke hoach cho CHINH don tu tao -> PLAN_ORDER_ALREADY_PLANNED, khong vong chay/chang moi', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const before = await counts();

      expect(
        await reasonOf(() =>
          planning.commit(
            outcome.orderId ?? '',
            { vehicleId, idempotencyKey: 'plan-lai', pendingWork },
            OFFICE,
          ),
        ),
      ).toBe('PLAN_ORDER_ALREADY_PLANNED');
      expect(await counts()).toEqual(before);
    });

    it('lap ke hoach don KHAC cho xe dang giu viec chua co don -> PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE', async () => {
      await confirm();
      const other = await anOrder('DH-KHAC');
      const before = await counts();

      expect(
        await reasonOf(() =>
          planning.commit(
            other.id,
            { vehicleId, idempotencyKey: 'plan-khac', pendingWork },
            OFFICE,
          ),
        ),
      ).toBe('PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE');
      expect(await counts()).toEqual(before);
      expect(await plans.findActiveForOrder(other.id)).toBeNull();
    });

    /* ================================================================ *
     * BAO BAT THUONG
     * ================================================================ */

    it('xe CHUA chay: huy don + ke hoach + chang + vong chay, khong xoa hang nao', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const orderId = outcome.orderId ?? '';
      const plan = await plans.findActiveForOrder(orderId);

      const exception = await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Khach huy don',
        idempotencyKey: 'bat-thuong-1',
      });

      expect(exception).toMatchObject({
        outcome: 'ORDER_CANCELLED_WORK_CANCELLED',
        status: 'ORDER_BOUND',
        orderId,
        operationPreserved: false,
        replayed: false,
      });
      expect((await movement.getOrder(orderId)).status).toBe('CANCELLED');
      expect(await plans.findActiveForOrder(orderId)).toBeNull();
      expect((await plans.find(plan?.id ?? ''))?.cancelledAt).not.toBeNull();
      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('CANCELLED');
      expect((await movementRepo.findRun(intake.runId))?.status).toBe('CANCELLED');
      expect(await auditActions(orderId)).toContain('transport.order.cancel');
      expect((await auditRepo.list({ action: 'transport.site_intake.exception' })).length).toBe(1);

      const replay = await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Khach huy don',
        idempotencyKey: 'bat-thuong-1',
      });
      expect(replay).toMatchObject({ outcome: 'ORDER_CANCELLED_WORK_CANCELLED', replayed: true });
      expect(
        await reasonOf(() =>
          commercial.reportException({
            actor: 'giam-doc',
            intakeId: intake.intakeId,
            reason: 'Lan hai',
            idempotencyKey: 'bat-thuong-2',
          }),
        ),
      ).toBe('SITE_INTAKE_EXCEPTION_ALREADY_RECORDED');
    });

    it('ly do TRANG (chi khoang trang) bi tu choi o tang dich vu, khong ghi gi', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const before = await counts();

      expect(
        await reasonOf(() =>
          commercial.reportException({
            actor: 'giam-doc',
            intakeId: intake.intakeId,
            reason: '   ',
            idempotencyKey: 'bat-thuong-trang',
          }),
        ),
      ).toBe('SITE_INTAKE_EXCEPTION_REASON_REQUIRED');
      expect(await counts()).toEqual(before);
      expect((await movement.getOrder(outcome.orderId ?? '')).status).toBe('OPEN');
      expect((await auditRepo.list({ action: 'transport.site_intake.exception' })).length).toBe(0);
    });

    it('vong chay con viec KHAC song thi chi huy chang cua viec nay', async () => {
      const intake = await confirm();
      await chooseDestination(intake.intakeId);
      const extra = await movement.addLeg(
        intake.runId,
        { sequence: 2, kind: 'EMPTY', originLabel: 'Bai xe B', destinationLabel: 'Bai xe Ha Noi' },
        OFFICE,
      );

      await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Khach huy don',
        idempotencyKey: 'bat-thuong-1',
      });

      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('CANCELLED');
      expect((await movementRepo.findLeg(extra.id))?.status).toBe('PLANNED');
      expect((await movementRepo.findRun(intake.runId))?.status).toBe('PLANNED');
    });

    it('xe DA chay: chi huy don, vong chay/chang giu nguyen', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      await movement.transitionLeg(intake.legId, 'IN_TRANSIT', AUTH);
      const runBefore = await movementRepo.findRun(intake.runId);

      const exception = await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Khach doi y giua duong',
        idempotencyKey: 'bat-thuong-1',
      });

      expect(exception).toMatchObject({
        outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
        operationPreserved: true,
      });
      expect((await movement.getOrder(outcome.orderId ?? '')).status).toBe('CANCELLED');
      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('IN_TRANSIT');
      expect((await movementRepo.findRun(intake.runId))?.status).toBe(runBefore?.status);
    });

    it('don da giao xong: chi GHI NHAN bat thuong, khong doi trang thai nao', async () => {
      const intake = await confirm();
      const outcome = await chooseDestination(intake.intakeId);
      const orderId = outcome.orderId ?? '';
      await movement.transitionOrder(orderId, 'FULFILLED', OFFICE);

      const exception = await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Hang giao thieu',
        idempotencyKey: 'bat-thuong-1',
      });

      expect(exception).toMatchObject({
        outcome: 'ANOMALY_RECORDED_ORDER_TERMINAL',
        status: 'ORDER_BOUND',
      });
      expect((await movement.getOrder(orderId)).status).toBe('FULFILLED');
      expect((await movementRepo.findLeg(intake.legId))?.status).toBe('PLANNED');
      expect((await movementRepo.findRun(intake.runId))?.status).toBe('PLANNED');
      expect(await plans.findActiveForOrder(orderId)).not.toBeNull();
    });

    it('viec CHUA co don bi bao bat thuong: REJECTED, huy viec chua chay, khong bao gio tu tao don', async () => {
      const intake = await confirm();

      const exception = await commercial.reportException({
        actor: 'giam-doc',
        intakeId: intake.intakeId,
        reason: 'Tai xe bam nham kho',
        idempotencyKey: 'bat-thuong-1',
      });
      expect(exception).toMatchObject({
        outcome: 'INTAKE_REJECTED_WORK_CANCELLED',
        status: 'REJECTED',
      });
      expect((await movementRepo.findRun(intake.runId))?.status).toBe('CANCELLED');

      const late = await chooseDestination(intake.intakeId);
      expect(late).toMatchObject({ status: 'REJECTED', bound: false, orderId: null });
      expect((await movementRepo.listOrders()).length).toBe(0);
    });

    /* ================================================================ *
     * DOC
     * ================================================================ */

    it('ban tin "Don moi tu tai xe" liet ke don tu tao DUNG mot lan; hang Can xu ly thi khong', async () => {
      const auto = await confirm();
      const outcome = await chooseDestination(auto.intakeId);
      await chooseDestination(auto.intakeId);
      await commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: auto.intakeId,
        idempotencyKey: 'k',
      });

      const activity = await review.activity(24);
      expect(activity.filter((item) => item.orderId === outcome.orderId)).toHaveLength(1);
      expect((await review.listNeedsReview()).map((fact) => fact.intakeId)).not.toContain(
        auto.intakeId,
      );
      expect(await pendingWork.pendingIntakeForVehicle(vehicleId)).toBeNull();
    });
  },
);

describe('bien cua than yeu cau #398', () => {
  const known = { kind: 'KNOWN_PLACE', placeId: 'fence-1' } as const;

  it('diem giao hop le di qua (hai hinh dang)', () => {
    expect(
      driverDestinationSchema.safeParse({ clientEventId: 'e1', destination: known }).success,
    ).toBe(true);
    expect(
      driverDestinationSchema.safeParse({
        clientEventId: 'e1',
        destination: {
          kind: 'PLACE_SEARCH',
          query: 'kho b',
          label: 'Kho B',
          latitude: 21,
          longitude: 105,
        },
      }).success,
    ).toBe(true);
  });

  it.each(['freightAmount', 'customerId', 'driverId', 'vehicleId', 'orderId'])(
    'truong `%s` bi TU CHOI o than lenh lan trong diem giao',
    (field) => {
      expect(
        driverDestinationSchema.safeParse({ clientEventId: 'e1', destination: known, [field]: 'x' })
          .success,
      ).toBe(false);
      expect(
        driverDestinationSchema.safeParse({
          clientEventId: 'e1',
          destination: { ...known, [field]: 'x' },
        }).success,
      ).toBe(false);
      expect(officeCompleteSchema.safeParse({ idempotencyKey: 'k', [field]: 'x' }).success).toBe(
        false,
      );
    },
  );

  it('mot cap so tu do khong phai mot diem giao', () => {
    expect(
      driverDestinationSchema.safeParse({
        clientEventId: 'e1',
        destination: { kind: 'COORDINATES', latitude: 21, longitude: 105 },
      }).success,
    ).toBe(false);
  });

  it('bao bat thuong BAT BUOC ly do that', () => {
    expect(
      reportExceptionSchema.safeParse({ reason: 'Khach huy', idempotencyKey: 'k' }).success,
    ).toBe(true);
    expect(reportExceptionSchema.safeParse({ idempotencyKey: 'k' }).success).toBe(false);
    expect(reportExceptionSchema.safeParse({ reason: '    ', idempotencyKey: 'k' }).success).toBe(
      false,
    );
    expect(reportExceptionSchema.safeParse({ reason: 'ok', idempotencyKey: 'k' }).success).toBe(
      false,
    );
    expect(reportExceptionSchema.safeParse({ reason: 'Khach huy' }).success).toBe(false);
  });

  it('gan don co san: dung hai truong, khong hon', () => {
    expect(bindExistingOrderSchema.safeParse({ orderId: 'o1', idempotencyKey: 'k' }).success).toBe(
      true,
    );
    expect(
      bindExistingOrderSchema.safeParse({ orderId: 'o1', idempotencyKey: 'k', freightAmount: 1 })
        .success,
    ).toBe(false);
  });
});
