import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import {
  InMemoryCounterpartyRepository,
  type CounterpartyRepository,
} from '../counterparty/counterparty.repository.js';
import {
  InMemoryCounterpartySiteRepository,
  type CounterpartySiteRepository,
} from '../counterparty/site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { InMemoryGeofenceRepository } from '../proof/geofence.repository.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { InMemoryRunSiteIntakeRepository } from './site-intake.repository.js';
import { SiteIntakeService } from './site-intake.service.js';
import { PENDING_DESTINATION_LABEL } from './site-intake.types.js';

/**
 * NHAN VIEC TAI DIA DIEM A — bo bai doi khang cua `#267` H3/H4/H7.
 *
 * Moi bai o day la ban dich sang ma cua MOT dong trong `#267`. Cai duoc kiem khong phai "ham co
 * chay khong" ma la "he thong co tu choi dung cai no phai tu choi khong" — nen phan lon cac bai
 * khang dinh mot MA TU CHOI, khong mot gia tri tra ve.
 */

const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const HA_NOI = { latitude: 21.0278, longitude: 105.8342 };
const NOW = new Date('2026-09-09T03:00:00.000Z');

/** Cong dinh vi gia — kho that cua Lane B doi mot phien gan vao mot CHUYEN, thu chua ton tai o A. */
class StubLocationFacts extends TransportSiteIntakeLocationFacts {
  readonly rows = new Map<string, SiteIntakeObservationFacts>();

  async findObservation(observationId: string): Promise<SiteIntakeObservationFacts | null> {
    return this.rows.get(observationId) ?? null;
  }
}

describe('SiteIntakeService — `#267` H3/H4/H7', () => {
  let sites: CounterpartySiteRepository;
  let counterparties: CounterpartyRepository;
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let geofences: InMemoryGeofenceRepository;
  let intakes: InMemoryRunSiteIntakeRepository;
  let locations: StubLocationFacts;
  let movement: MovementService;
  let siteService: CounterpartySiteService;
  let service: SiteIntakeService;

  let siteId: string;
  let driverId: string;
  let vehicleId: string;

  const AUTH = 'lai-xe-mot';
  const OTHER_AUTH = 'lai-xe-hai';

  beforeEach(async () => {
    sites = new InMemoryCounterpartySiteRepository();
    counterparties = new InMemoryCounterpartyRepository();
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    geofences = new InMemoryGeofenceRepository();
    intakes = new InMemoryRunSiteIntakeRepository();
    locations = new StubLocationFacts();

    siteService = new CounterpartySiteService(sites, counterparties);
    movement = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
    );

    service = new SiteIntakeService(
      intakes,
      new TransportSiteIntakeCoreFactsAdapter(fleet, movementRepo, siteService),
      new TransportSiteIntakeGeoFactsAdapter(geofences),
      locations,
      movement,
      POLICY,
      undefined,
      undefined,
      () => NOW,
    );

    const party = await counterparties.create({ name: 'Cong ty ABC' });
    siteId = (
      await sites.create({
        counterpartyId: party.id,
        name: 'Kho Hai Phong',
        address: 'KCN Dinh Vu',
        note: null,
        status: 'ACTIVE',
        recordedBy: 'operator',
      })
    ).id;
    await geofences.register({
      label: 'Kho Hai Phong',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: siteId,
      latitude: HAI_PHONG.latitude,
      longitude: HAI_PHONG.longitude,
      radiusMetres: 300,
      note: null,
      recordedBy: 'operator',
    });

    const vehicle = await fleet.createVehicle({
      registrationPlate: '15C-11111',
      vehicleClass: 'Dau keo',
    });
    vehicleId = vehicle.id;
    const driver = await aDriver('Nguyen Van A', AUTH);
    driverId = driver.id;
    await fleet.assignDriverToVehicle(vehicleId, driverId, NOW);
  });

  /** Mot ho so lai xe day du — `CreateDriverInput` doi ca so dien thoai lan hang/han GPLX. */
  const aDriver = (fullName: string, authUserId: string) =>
    fleet.createDriver({
      fullName,
      phone: '0900000000',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId,
    });

  const confirm = (overrides: Record<string, unknown> = {}) =>
    service.confirm({
      authUserId: AUTH,
      siteId,
      clientEventId: 'cham-mot',
      latitude: HAI_PHONG.latitude,
      longitude: HAI_PHONG.longitude,
      accuracyMetres: 10,
      ...overrides,
    } as Parameters<SiteIntakeService['confirm']>[0]);

  const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
      return 'KHONG-NEM';
    } catch (error) {
      return (error as { reason?: string }).reason ?? String(error);
    }
  };

  /* ================================================================== *
   * H2 — DE NGHI KHONG BAO GIO TAO
   * ================================================================== */

  describe('H2 — de nghi doc, va chi doc', () => {
    it('nhan ra dung dia diem A, kem ten phap nhan cho hai dong tren man hinh', async () => {
      const proposal = await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });

      expect(proposal.outcome).toBe('UNIQUE');
      expect(proposal.candidates).toHaveLength(1);
      expect(proposal.candidates[0]?.counterpartyName).toBe('Cong ty ABC');
      expect(proposal.candidates[0]?.siteName).toBe('Kho Hai Phong');
      expect(proposal.canCreate).toBe(true);
    });

    /**
     * BAI TRUNG TAM CUA CA LANE. `#267`: *"No trip/run may be silently auto-created solely because
     * a device entered a geofence."*
     */
    it('KHONG mot vong chay nao ra doi chi vi da co de nghi', async () => {
      await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });
      await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });

      expect(await movementRepo.listRuns()).toEqual([]);
      expect(await intakes.listForDriver(driverId)).toEqual([]);
    });

    it('o mot noi khong co kho nao -> NO_MATCH, va khong the tao', async () => {
      const proposal = await service.propose({
        authUserId: AUTH,
        latitude: HA_NOI.latitude,
        longitude: HA_NOI.longitude,
        accuracyMetres: 10,
      });

      expect(proposal.outcome).toBe('NO_MATCH');
      expect(proposal.canCreate).toBe(false);
    });

    it('khong gui vi tri nao -> khong loi, nhung cung khong ung vien nao', async () => {
      const proposal = await service.propose({ authUserId: AUTH });

      expect(proposal.outcome).toBe('NO_MATCH');
      expect(proposal.locationTrust).toBe('DRIVER_REPORTED');
      expect(proposal.canCreate).toBe(false);
    });

    /** Hang rao tro toi mot kho DA NGHI khong duoc de nghi cho ai. */
    it('kho da nghi khong hien ra lam ung vien', async () => {
      const site = await sites.find(siteId);
      await sites.update(siteId, { status: 'INACTIVE' });
      expect(site).not.toBeNull();

      const proposal = await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });
      expect(proposal.candidates).toEqual([]);
      expect(proposal.canCreate).toBe(false);
    });

    it('tai khoan chua noi voi ho so lai xe nao bi tu choi', async () => {
      expect(await reasonOf(() => service.propose({ authUserId: 'nguoi-la' }))).toBe(
        'SITE_INTAKE_DRIVER_BINDING_MISSING',
      );
    });
  });

  /* ================================================================== *
   * H4 — TAO TOI THIEU, KHONG BIA MOT DONG TIEN NAO
   * ================================================================== */

  describe('H4 — vong chay toi thieu sau cham xac nhan', () => {
    it('mot cham tao DUNG mot vong chay va DUNG mot chang', async () => {
      const result = await confirm();

      const runs = await movementRepo.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.id).toBe(result.runId);
      expect(await movementRepo.listLegs(result.runId)).toHaveLength(1);
      expect(result.replayed).toBe(false);
    });

    /**
     * `#267` H4: *"no freight/revenue/payment term/commission/settlement data may be fabricated"*,
     * va *"do not fill missing money with zero as if zero were true"*.
     */
    it('KHONG bia mot dong tien nao — khong nghia vu thuong mai, khong cuoc', async () => {
      const result = await confirm();

      expect(await movementRepo.listOrders()).toEqual([]);
      const legs = await movementRepo.listLegs(result.runId);
      expect(legs[0]?.orderId).toBeNull();
      // Khong cot tien nao tren chang, va khong con so 0 nao gia vo la mot su that.
      expect(legs[0]?.distanceKm).toBeNull();
    });

    /** `#267` H4: xe phai duoc SUY tu trang thai phan cong, khong tu than yeu cau. */
    it('xe duoc suy tu ban phan cong dang hieu luc', async () => {
      const result = await confirm();
      const runs = await movementRepo.listRuns();
      expect(runs[0]?.vehicleId).toBe(vehicleId);
      expect((await movementRepo.activeRunAssignment(result.runId))?.driverId).toBe(driverId);
    });

    it('lai xe chua duoc giao xe nao thi khong tao duoc gi', async () => {
      const soloDriver = await aDriver('Tran Van B', OTHER_AUTH);
      expect(soloDriver.id).not.toBe(driverId);

      expect(await reasonOf(() => confirm({ authUserId: OTHER_AUTH }))).toBe(
        'SITE_INTAKE_NO_ASSIGNED_VEHICLE',
      );
      expect(await movementRepo.listRuns()).toEqual([]);
    });

    /**
     * `TransportRunLeg.destinationLabel` la `NOT NULL` cua Lane A, va `#267` cam sua mo hinh cua
     * lane khac. Nen chang mang mot nhan noi ro la chua biet, VA khung nhin doc phoi ra co
     * `destinationPending` de khong tang nao phai so chuoi.
     */
    it('diem den chua biet duoc NOI RA, khong bi bia', async () => {
      const result = await confirm();
      const legs = await movementRepo.listLegs(result.runId);

      expect(legs[0]?.destinationLabel).toBe(PENDING_DESTINATION_LABEL);
      expect(result.destinationPending).toBe(true);
      expect(legs[0]?.originLabel).toBe('Cong ty ABC — Kho Hai Phong');
    });

    it('lai xe BIET diem den thi go vao, va nhan tat di', async () => {
      const result = await confirm({ destinationLabel: 'Kho Bac Ninh' });
      const legs = await movementRepo.listLegs(result.runId);

      expect(legs[0]?.destinationLabel).toBe('Kho Bac Ninh');
      expect(result.destinationPending).toBe(false);
    });

    /**
     * Vong chay o `PLANNED`, khong `ACTIVE`. Khong ai dieu chiec xe nay ca — lai xe tu dang ky, va
     * trang thai phai noi dung dieu do. Moc van hanh cua `#243` F1 ghi duoc len mot vong chay
     * `PLANNED`, nen khong co gi bi chan.
     */
    it('vong chay o PLANNED — khong ai dieu no ca', async () => {
      const result = await confirm();
      const runs = await movementRepo.listRuns();
      expect(runs[0]?.status).toBe('PLANNED');
      expect(result.runCode).toMatch(/^RUN-A260909-[0-9A-F]{6}$/);
    });

    /**
     * `#243` F1 gan moc cong/boc hang vao CHANG (`CHECKPOINT_LEG_REQUIRED`). Vong chay khong chang
     * se lam man hinh ke tiep khong co gi de bam — nen chang la mot phan cua "toi thieu".
     */
    it('chang duoc tao ngay, de moc cong/boc hang cua `#243` co cho gan vao', async () => {
      const result = await confirm();
      const legs = await movementRepo.listLegs(result.runId);

      expect(legs[0]?.id).toBe(result.legId);
      expect(legs[0]?.sequence).toBe(1);
      expect(legs[0]?.kind).toBe('LOADED');
    });
  });

  /* ================================================================== *
   * H3 — CHONG LAP VA VONG CHAY DANG MO
   * ================================================================== */

  describe('H3 — mot cham la mot vong chay, khong hon', () => {
    it('cham hai lan voi cung khoa chi tao MOT vong chay', async () => {
      const first = await confirm();
      const second = await confirm();

      expect(second.runId).toBe(first.runId);
      expect(second.replayed).toBe(true);
      expect(await movementRepo.listRuns()).toHaveLength(1);
      expect(await intakes.listForDriver(driverId)).toHaveLength(1);
    });

    /**
     * Phat lai tu hang doi ngoai tuyen: cung khoa, gui lai SAU KHI vong chay dau da ton tai. Doc
     * chong lap phai xay ra TRUOC phep kiem "dang co vong chay mo" — neu khong, chinh hau qua cua
     * lan ghi dau se tu choi mot lan gui lai hop le.
     */
    it('phat lai ngoai tuyen khong bi chinh vong chay vua tao tu choi', async () => {
      const first = await confirm();
      const replayed = await confirm();

      expect(replayed.replayed).toBe(true);
      expect(replayed.runId).toBe(first.runId);
      expect(replayed.legId).toBe(first.legId);
    });

    /** `#267` H7: *"Driver cannot create a second active run when an applicable current run exists"*. */
    it('cham lan hai voi khoa KHAC bi tu choi vi da co vong chay chua ket thuc', async () => {
      await confirm();

      expect(await reasonOf(() => confirm({ clientEventId: 'cham-hai' }))).toBe(
        'SITE_INTAKE_OPEN_RUN_EXISTS',
      );
      expect(await movementRepo.listRuns()).toHaveLength(1);
    });

    /**
     * `#267` H3/H6: khi da co vong chay, man hinh phai hien `Ghi nhan da den`, khong `Tao chuyen`.
     * De nghi VAN tra ve dia diem — man hinh can in *"Ban dang o Cong ty ABC / Chuyen hien tai:
     * RUN-..."* — chi khac la `canCreate` tat.
     */
    it('de nghi van noi dang o dau, nhung tat duong tao va chi ra chuyen hien tai', async () => {
      const created = await confirm();

      const proposal = await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });

      expect(proposal.outcome).toBe('UNIQUE');
      expect(proposal.candidates[0]?.siteName).toBe('Kho Hai Phong');
      expect(proposal.canCreate).toBe(false);
      expect(proposal.openRuns.map((run) => run.runId)).toEqual([created.runId]);
    });

    it('vong chay da huy khong con chan lan nhan viec sau', async () => {
      const first = await confirm();
      await movement.cancelRun(first.runId, 'lai xe bam nham', 'operator');

      const second = await confirm({ clientEventId: 'cham-hai' });
      expect(second.runId).not.toBe(first.runId);
      expect(await movementRepo.listRuns()).toHaveLength(2);
    });

    it('vong chay cua lai xe KHAC khong chan minh', async () => {
      await confirm();

      const otherDriver = await aDriver('Tran Van B', OTHER_AUTH);
      const otherVehicle = await fleet.createVehicle({
        registrationPlate: '15C-22222',
        vehicleClass: 'Dau keo',
      });
      await fleet.assignDriverToVehicle(otherVehicle.id, otherDriver.id, NOW);

      const result = await confirm({ authUserId: OTHER_AUTH, clientEventId: 'cham-cua-b' });
      expect(result.replayed).toBe(false);
      expect(await movementRepo.listRuns()).toHaveLength(2);
    });

    /**
     * Khoa chong lap la `(driverId, clientEventId)`. Hai lai xe cung dung mot chuoi `cham-mot` —
     * chuyen chac chan xay ra neu ung dung sinh khoa theo mot bo dem cuc bo — khong duoc chan nhau.
     */
    it('cung mot khoa o HAI lai xe khac nhau la hai lan nhan viec khac nhau', async () => {
      const otherDriver = await aDriver('Tran Van B', OTHER_AUTH);
      const otherVehicle = await fleet.createVehicle({
        registrationPlate: '15C-22222',
        vehicleClass: 'Dau keo',
      });
      await fleet.assignDriverToVehicle(otherVehicle.id, otherDriver.id, NOW);

      const mine = await confirm();
      const theirs = await confirm({ authUserId: OTHER_AUTH });

      expect(theirs.replayed).toBe(false);
      expect(theirs.runId).not.toBe(mine.runId);
    });
  });

  /* ================================================================== *
   * H7 — QUYEN VA BANG CHUNG
   * ================================================================== */

  describe('H7 — quyen, bang chung, va nhung duong phai dong', () => {
    it('dia diem khong co that -> fail-closed, khong tao gi', async () => {
      expect(await reasonOf(() => confirm({ siteId: 'khong-co-that' }))).toBe(
        'SITE_INTAKE_SITE_NOT_FOUND',
      );
      expect(await movementRepo.listRuns()).toEqual([]);
    });

    /**
     * `#267` H7: *"Unknown versus foreign IDs do not create useful enumeration"*. Mot kho CO THAT
     * nhung da nghi phai tra ve DUNG ma ma mot kho khong ton tai tra ve — hai cau tra loi rieng se
     * cho nguoi go bua biet cai nao co that.
     */
    it('kho da nghi tra ve DUNG ma voi kho khong ton tai', async () => {
      await sites.update(siteId, { status: 'INACTIVE' });
      expect(await reasonOf(() => confirm())).toBe('SITE_INTAKE_SITE_NOT_FOUND');
    });

    /**
     * `#267` H7: *"Ambiguous sites cannot be auto-selected"*. May chu khong chon, va cham xac nhan
     * van phai chi ra MOT trong so ung vien cua chinh vi tri do.
     */
    it('vi tri that + kho KHONG quanh do -> tu choi, du kho co that va dang hoat dong', async () => {
      const party = await counterparties.create({ name: 'Cong ty XYZ' });
      const farSite = await sites.create({
        counterpartyId: party.id,
        name: 'Kho Ha Noi',
        address: null,
        note: null,
        status: 'ACTIVE',
        recordedBy: 'operator',
      });
      await geofences.register({
        label: 'Kho Ha Noi',
        subjectKind: 'COUNTERPARTY_SITE',
        subjectId: farSite.id,
        latitude: HA_NOI.latitude,
        longitude: HA_NOI.longitude,
        radiusMetres: 300,
        note: null,
        recordedBy: 'operator',
      });

      expect(await reasonOf(() => confirm({ siteId: farSite.id }))).toBe(
        'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
      );
      expect(await movementRepo.listRuns()).toEqual([]);
    });

    /**
     * `#267` H7: *"A stale location outside bounded freshness cannot silently create/attach a
     * pickup."* Chu quan trong la *silently* — nen day la mot lan TU CHOI, khong phai mot lan lang
     * le ha xuong "coi nhu khong gui vi tri".
     */
    it('ban dinh vi qua han tuoi bi TU CHOI, khong bi lang le ha cap', async () => {
      locations.rows.set('obs-cu', {
        id: 'obs-cu',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
        capturedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
        receivedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
        driverId,
      });

      expect(
        await reasonOf(() =>
          confirm({
            latitude: undefined,
            longitude: undefined,
            accuracyMetres: undefined,
            observationId: 'obs-cu',
          }),
        ),
      ).toBe('SITE_INTAKE_LOCATION_UNUSABLE');
      expect(await movementRepo.listRuns()).toEqual([]);
    });

    it('sai so lon toi muc vo nghia bi TU CHOI', async () => {
      expect(await reasonOf(() => confirm({ accuracyMetres: 5_000 }))).toBe(
        'SITE_INTAKE_LOCATION_UNUSABLE',
      );
    });

    /** Muon ban dinh vi cua dong nghiep lam bang chung cho chinh minh. */
    it('ban dinh vi cua LAI XE KHAC bi tu choi', async () => {
      const otherDriver = await aDriver('Tran Van B', OTHER_AUTH);
      locations.rows.set('obs-cua-b', {
        id: 'obs-cua-b',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
        capturedAt: NOW,
        receivedAt: NOW,
        driverId: otherDriver.id,
      });

      expect(
        await reasonOf(() =>
          confirm({
            latitude: undefined,
            longitude: undefined,
            accuracyMetres: undefined,
            observationId: 'obs-cua-b',
          }),
        ),
      ).toBe('SITE_INTAKE_OBSERVATION_NOT_OWNED');
      expect(await movementRepo.listRuns()).toEqual([]);
    });

    it('ban dinh vi khong co that bi tu choi', async () => {
      expect(
        await reasonOf(() =>
          confirm({
            latitude: undefined,
            longitude: undefined,
            accuracyMetres: undefined,
            observationId: 'obs-ma',
          }),
        ),
      ).toBe('SITE_INTAKE_OBSERVATION_NOT_FOUND');
    });

    /**
     * Ban dinh vi CUA CHINH MINH, con moi, dung cho -> duong manh nhat. Nhan `SERVER_BOUND` va
     * khoang cach duoc ghi lai de nguoi doi soat sau nay doc duoc.
     */
    it('ban dinh vi hop le cho ra nhan SERVER_BOUND va mot khoang cach do duoc', async () => {
      locations.rows.set('obs-tot', {
        id: 'obs-tot',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 8,
        capturedAt: new Date(NOW.getTime() - 30_000),
        receivedAt: new Date(NOW.getTime() - 20_000),
        driverId,
      });

      const result = await confirm({
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
        observationId: 'obs-tot',
      });

      expect(result.locationTrust).toBe('SERVER_BOUND');
      expect(result.distanceMetres).toBe(0);
    });

    /**
     * Khong gui vi tri nao ca la mot duong HOP LE — lai xe trong nha xuong, khong song. So ghi noi
     * dung the: `DRIVER_REPORTED`, khong ban dinh vi, khong khoang cach. Khong lan noi doi nao.
     */
    it('chon tay khong kem vi tri van tao duoc, va so ghi noi dung suc nang cua no', async () => {
      const result = await confirm({
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
      });

      expect(result.locationTrust).toBe('DRIVER_REPORTED');
      expect(result.distanceMetres).toBeNull();
      const row = (await intakes.listForDriver(driverId))[0];
      expect(row?.observationId).toBeNull();
    });

    /**
     * MOT cap toa do THO khong bao gio tro thanh mot `TransportLocationObservation`. Ba bang bang
     * chung cua Lane B/F giu nguyen dieu kien vao cua chung — Lane H khong mo mot cua sau nao.
     */
    it('duong nay khong sinh ra mot ban dinh vi nao', async () => {
      await confirm();
      const row = (await intakes.listForDriver(driverId))[0];
      expect(row?.observationId).toBeNull();
      expect(locations.rows.size).toBe(0);
    });

    it('mot ban dinh vi khong lam bang chung cho hai lan nhan viec', async () => {
      locations.rows.set('obs-tot', {
        id: 'obs-tot',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 8,
        capturedAt: NOW,
        receivedAt: NOW,
        driverId,
      });
      const withObservation = {
        latitude: undefined,
        longitude: undefined,
        accuracyMetres: undefined,
        observationId: 'obs-tot',
      };

      const first = await confirm(withObservation);
      await movement.cancelRun(first.runId, 'huy de thu lai', 'operator');

      expect(await reasonOf(() => confirm({ ...withObservation, clientEventId: 'cham-hai' }))).toBe(
        'SITE_INTAKE_OBSERVATION_ALREADY_USED',
      );
    });
  });
});
