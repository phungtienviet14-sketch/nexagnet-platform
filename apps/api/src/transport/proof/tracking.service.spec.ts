import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';
import { InMemoryTrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import type { IngestObservationCommand } from './tracking.types.js';
import {
  TransportProofCoreFacts,
  type ProofDriverFacts,
  type ProofRunFacts,
  type ProofVehicleFacts,
  type ProofTripFacts,
} from './transport-proof-facts.port.js';

/**
 * PROOF-020 — bai kiem DOI KHANG cua tang bam vi tri.
 *
 * Moi bai o day mo ta mot nguoi dang CO TINH lam mot viec ho khong duoc lam, chu khong phai mot
 * nguoi go nham. Do la ly do chung co muc rieng: mot bai kiem an ninh bi xoa nham se im lang, con
 * mot muc ten `DOI KHANG` bien mat khoi tep thi khong.
 */

const T0 = new Date('2026-09-07T03:00:00Z');
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };

class FakeCoreFacts extends TransportProofCoreFacts {
  readonly drivers = new Map<string, ProofDriverFacts>();
  readonly trips = new Map<string, ProofTripFacts>();
  readonly assignments = new Map<string, Set<string>>();
  readonly vehicles = new Map<string, string | null>();
  readonly runs = new Map<string, ProofRunFacts>();
  readonly runAssignments = new Map<string, Set<string>>();

  async findDriverByAuthUserId(authUserId: string): Promise<ProofDriverFacts | null> {
    return this.drivers.get(authUserId) ?? null;
  }

  async findTrip(tripId: string): Promise<ProofTripFacts | null> {
    return this.trips.get(tripId) ?? null;
  }

  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    return this.assignments.get(tripId)?.has(driverId) ?? false;
  }

  async activeVehicleForTrip(tripId: string): Promise<string | null> {
    return this.vehicles.get(tripId) ?? null;
  }

  async findRun(runId: string): Promise<ProofRunFacts | null> {
    return this.runs.get(runId) ?? null;
  }

  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    return this.runAssignments.get(runId)?.has(driverId) ?? false;
  }

  /**
   * Khong bai nao trong tep nay di qua cua nhap telematics, nen ban gia tra `null` — tuc "khong
   * tim thay chiec xe nao". Fail-closed la mac dinh dung cho mot ban gia: neu mot duong moi lang le
   * bat dau goi ham nay, no se bi TU CHOI chu khong duoc cho qua bang mot cau tra loi bia.
   */
  async findVehicle(): Promise<ProofVehicleFacts | null> {
    return null;
  }
}

describe('Bam vi tri — DOI KHANG — PROOF-020', () => {
  let repository: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let service: TrackingService;
  let now: Date;

  const ingest = (overrides: Partial<IngestObservationCommand>): IngestObservationCommand => ({
    authUserId: 'user-a',
    sessionId: '',
    clientEventId: 'evt-1',
    latitude: HANOI.latitude,
    longitude: HANOI.longitude,
    accuracyMetres: 8,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    source: 'DEVICE_GNSS',
    capturedAt: T0,
    mockLocationReported: false,
    ...overrides,
  });

  beforeEach(() => {
    now = T0;
    repository = new InMemoryTrackingRepository();
    facts = new FakeCoreFacts();
    facts.drivers.set('user-a', { id: 'driver-a', fullName: 'Lai xe A' });
    facts.drivers.set('user-b', { id: 'driver-b', fullName: 'Lai xe B' });
    facts.trips.set('trip-a', { id: 'trip-a', code: 'HN-HP-01', status: 'IN_TRANSIT' });
    facts.trips.set('trip-b', { id: 'trip-b', code: 'HN-HP-02', status: 'IN_TRANSIT' });
    facts.trips.set('trip-done', { id: 'trip-done', code: 'HN-HP-99', status: 'DELIVERED' });
    facts.assignments.set('trip-a', new Set(['driver-a']));
    facts.assignments.set('trip-b', new Set(['driver-b']));
    facts.assignments.set('trip-done', new Set(['driver-a']));
    facts.vehicles.set('trip-a', 'vehicle-1');
    facts.vehicles.set('trip-b', 'vehicle-2');

    service = new TrackingService(
      repository,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
      undefined,
      () => now,
    );
  });

  const openA = () => service.openSession({ authUserId: 'user-a', tripId: 'trip-a', device: null });

  it('mo phien tren chuyen cua chinh minh thi duoc, va XE do MAY CHU dien', async () => {
    const session = await openA();
    expect(session.driverId).toBe('driver-a');
    expect(session.tripId).toBe('trip-a');
    // Khong mot lenh nao nhan `vehicleId`; no den tu ban phan cong.
    expect(session.vehicleId).toBe('vehicle-1');
    expect(session.status).toBe('ACTIVE');
  });

  it('LAI XE A KHONG mo duoc phien tren chuyen cua LAI XE B', async () => {
    await expect(
      service.openSession({ authUserId: 'user-a', tripId: 'trip-b', device: null }),
    ).rejects.toMatchObject({ reason: 'DRIVER_NOT_ASSIGNED_TO_TRIP', kind: 'DENIED' });
  });

  it('tai khoan khong noi voi ho so lai xe nao thi bi tu choi voi ma RIENG', async () => {
    await expect(
      service.openSession({ authUserId: 'user-khong-co', tripId: 'trip-a', device: null }),
    ).rejects.toMatchObject({ reason: 'DRIVER_BINDING_MISSING' });
  });

  it('chuyen da giao xong thi khong mo phien duoc', async () => {
    await expect(
      service.openSession({ authUserId: 'user-a', tripId: 'trip-done', device: null }),
    ).rejects.toMatchObject({ reason: 'TRIP_NOT_ACTIVE', kind: 'CONFLICT' });
  });

  it('mo lai dung phien do thi tra ban cu — khong tao phien thu hai', async () => {
    const first = await openA();
    const second = await openA();
    expect(second.id).toBe(first.id);
    expect(await repository.listSessionsForDriver('driver-a')).toHaveLength(1);
  });

  it('MOT lai xe khong the co hai phien mo cung luc', async () => {
    facts.assignments.set('trip-b', new Set(['driver-a', 'driver-b']));
    await openA();
    await expect(
      service.openSession({ authUserId: 'user-a', tripId: 'trip-b', device: null }),
    ).rejects.toMatchObject({ reason: 'DRIVER_HAS_ANOTHER_OPEN_SESSION' });
  });

  /* --- cach ly giua hai lai xe --------------------------------------- */

  it('LAI XE B KHONG GHI duoc vao phien cua LAI XE A', async () => {
    const session = await openA();
    await expect(
      service.ingest(ingest({ authUserId: 'user-b', sessionId: session.id })),
    ).rejects.toMatchObject({ reason: 'SESSION_NOT_OWNED', kind: 'DENIED' });
    expect(await repository.listObservations(session.id)).toHaveLength(0);
  });

  it('LAI XE B KHONG DONG duoc phien cua LAI XE A', async () => {
    const session = await openA();
    await expect(
      service.closeSession('user-b', session.id, 'DRIVER_STOPPED'),
    ).rejects.toMatchObject({ reason: 'SESSION_NOT_OWNED' });
    expect((await repository.findSession(session.id))?.status).toBe('ACTIVE');
  });

  /* --- phat lai ------------------------------------------------------- */

  it('gui lai DUNG mot su kien khong sinh them hang nao', async () => {
    const session = await openA();
    const first = await service.ingest(ingest({ sessionId: session.id }));
    const again = await service.ingest(ingest({ sessionId: session.id }));
    expect(again.id).toBe(first.id);
    expect(await repository.listObservations(session.id)).toHaveLength(1);
  });

  it('dung LAI mot ma su kien cho NOI DUNG KHAC la mot va cham on ao', async () => {
    const session = await openA();
    await service.ingest(ingest({ sessionId: session.id }));
    await expect(
      service.ingest(
        ingest({
          sessionId: session.id,
          latitude: HAIPHONG.latitude,
          longitude: HAIPHONG.longitude,
        }),
      ),
    ).rejects.toMatchObject({ reason: 'OBSERVATION_EVENT_ID_REUSED', kind: 'CONFLICT' });
    // Ban cu VAN CON — mot va cham khong duoc phep xoa bang chung da co.
    expect(await repository.listObservations(session.id)).toHaveLength(1);
  });

  /* --- dong ho may khach khong phai su that ---------------------------- */

  it('may chu ghi `receivedAt` cua CHINH NO, khong lay `capturedAt` cua may khach', async () => {
    const session = await openA();
    now = new Date(T0.getTime() + 60_000);
    const observation = await service.ingest(
      ingest({ sessionId: session.id, capturedAt: new Date('2020-01-01T00:00:00Z') }),
    );
    expect(observation.receivedAt).toEqual(now);
    expect(observation.capturedAt).toEqual(new Date('2020-01-01T00:00:00Z'));
    expect(observation.clockSkewSeconds).toBeLessThan(-200_000_000);
  });

  it('dong ho lech xa VAN duoc ghi — gan co, khong tu choi', async () => {
    const session = await openA();
    const observation = await service.ingest(
      ingest({ sessionId: session.id, capturedAt: new Date(T0.getTime() - 6 * 3600 * 1000) }),
    );
    expect(observation.id).toBeTruthy();
    const flags = await repository.listRiskFlagsForSession(session.id);
    expect(flags.map((flag) => flag.code)).toContain('CLOCK_SKEW_EXCEEDED');
  });

  /* --- toa do rac ------------------------------------------------------ */

  it('(0,0) bi tu choi — do la gia tri mac dinh cua mot loi dinh vi', async () => {
    const session = await openA();
    await expect(
      service.ingest(ingest({ sessionId: session.id, latitude: 0, longitude: 0 })),
    ).rejects.toMatchObject({ reason: 'COORDINATE_REJECTED', kind: 'INVALID' });
  });

  it('toa do ngoai dai bi tu choi', async () => {
    const session = await openA();
    await expect(
      service.ingest(ingest({ sessionId: session.id, latitude: 91, longitude: 105 })),
    ).rejects.toMatchObject({ reason: 'COORDINATE_REJECTED' });
  });

  /* --- co rui ro: GHI, khong PHAT ------------------------------------- */

  it('vi tri gia lap sinh CO REVIEW nhung ban ghi VAN duoc nhan', async () => {
    const session = await openA();
    const observation = await service.ingest(
      ingest({ sessionId: session.id, mockLocationReported: true }),
    );
    expect(observation.id).toBeTruthy();
    const flags = await repository.listRiskFlagsForSession(session.id);
    expect(flags.find((flag) => flag.code === 'MOCK_LOCATION_REPORTED')?.severity).toBe('REVIEW');
  });

  it('sai so lon sinh co INFO, khong chan', async () => {
    const session = await openA();
    await service.ingest(ingest({ sessionId: session.id, accuracyMetres: 800 }));
    const flags = await repository.listRiskFlagsForSession(session.id);
    expect(flags.find((flag) => flag.code === 'ACCURACY_POOR')?.severity).toBe('INFO');
  });

  it('dich chuyen bat kha thi sinh co REVIEW tren ban ghi THU HAI', async () => {
    const session = await openA();
    await service.ingest(ingest({ sessionId: session.id, clientEventId: 'evt-1' }));
    now = new Date(T0.getTime() + 60_000);
    await service.ingest(
      ingest({
        sessionId: session.id,
        clientEventId: 'evt-2',
        latitude: HAIPHONG.latitude,
        longitude: HAIPHONG.longitude,
        capturedAt: new Date(T0.getTime() + 60_000),
      }),
    );
    const flags = await repository.listRiskFlagsForSession(session.id);
    expect(flags.find((flag) => flag.code === 'IMPLAUSIBLE_SPEED')?.severity).toBe('REVIEW');
    expect(await repository.listObservations(session.id)).toHaveLength(2);
  });

  /* --- phien da dong ---------------------------------------------------- */

  it('phien da dong thi khong nhan them ban dinh vi', async () => {
    const session = await openA();
    await service.closeSession('user-a', session.id, 'DRIVER_STOPPED');
    await expect(
      service.ingest(ingest({ sessionId: session.id, clientEventId: 'evt-sau' })),
    ).rejects.toMatchObject({ reason: 'SESSION_NOT_ACTIVE' });
  });

  it('dong hai lan la idempotent, khong nem', async () => {
    const session = await openA();
    await service.closeSession('user-a', session.id, 'DRIVER_STOPPED');
    const again = await service.closeSession('user-a', session.id, 'DRIVER_STOPPED');
    expect(again.status).toBe('CLOSED');
  });

  it('dong phien roi mo lai tren cung chuyen thi duoc — mot ca lam moi', async () => {
    const first = await openA();
    await service.closeSession('user-a', first.id, 'DRIVER_STOPPED');
    const second = await openA();
    expect(second.id).not.toBe(first.id);
  });

  /* --- rang buoc thiet bi ---------------------------------------------- */

  it('MA CAI DAT cua lai xe A khong dung duoc boi lai xe B', async () => {
    const device = { installationId: 'inst-1', platform: 'ANDROID' as const, appVersion: '1.0.0' };
    await service.openSession({ authUserId: 'user-a', tripId: 'trip-a', device });
    await expect(
      service.openSession({ authUserId: 'user-b', tripId: 'trip-b', device }),
    ).rejects.toMatchObject({ reason: 'DEVICE_BOUND_TO_ANOTHER_DRIVER', kind: 'DENIED' });
  });

  /* --- khung nhin tom tat KHONG chua toa do ---------------------------- */

  it('tom tat dem duoc, do duoc quang duong, nhung KHONG mang mot toa do nao', async () => {
    const session = await openA();
    await service.ingest(ingest({ sessionId: session.id, clientEventId: 'evt-1' }));
    now = new Date(T0.getTime() + 30_000);
    await service.ingest(
      ingest({
        sessionId: session.id,
        clientEventId: 'evt-2',
        latitude: HANOI.latitude + 0.006737,
        capturedAt: new Date(T0.getTime() + 30_000),
      }),
    );

    const [summary] = await service.summariesForTrip('trip-a');
    expect(summary?.observationCount).toBe(2);
    expect(summary?.travelledMetres).toBeGreaterThan(700);
    expect(summary?.travelledMetres).toBeLessThan(800);

    // Bang chung cau truc: khong mot gia tri nao trong tom tat trong giong mot toa do.
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain('105.85');
    expect(serialised).not.toContain('21.02');
  });

  it('duong di THO tra ve du diem, va do la mot ham RIENG', async () => {
    const session = await openA();
    await service.ingest(ingest({ sessionId: session.id }));
    const track = await service.trackForSession(session.id, 'operator');
    expect(track.points).toHaveLength(1);
    expect(track.points[0]?.point.latitude).toBeCloseTo(HANOI.latitude, 6);
  });
});

describe('Bam vi tri — loi khong tim thay — PROOF-021', () => {
  it('phien khong ton tai thi NOT_FOUND, khong phai DENIED', async () => {
    const repository = new InMemoryTrackingRepository();
    const facts = new FakeCoreFacts();
    facts.drivers.set('user-a', { id: 'driver-a', fullName: 'Lai xe A' });
    const service = new TrackingService(
      repository,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
    );
    await expect(service.closeSession('user-a', 'khong-co', 'X')).rejects.toBeInstanceOf(
      TransportDomainError,
    );
    await expect(service.closeSession('user-a', 'khong-co', 'X')).rejects.toMatchObject({
      kind: 'NOT_FOUND',
      reason: 'SESSION_NOT_FOUND',
    });
  });
});

/**
 * PROOF-022 — PHIEN BAM VI TRI THEO VONG CHAY (`#327` `ARCHITECTURE_DECISION_2026_09_19`).
 *
 * ==============================================================================================
 * VI SAO MUC NAY TON TAI
 * ==============================================================================================
 *
 * Luong Order-first cua Lane W sinh `TransportVehicleRun`, khong sinh `TransportTrip`. Truoc ban
 * nay, duong tu bao vi tri cua lai xe chi mo duoc phien theo `tripId` — nen mot lai xe that, tren
 * mot vong chay that, KHONG lam duoc ban dinh vi nao, va do do khong ghi noi `DELIVERY_ARRIVAL`
 * (moc bat buoc kem vi tri theo `#232` D-08). O kin do la ca ly do cua mien nay.
 *
 * BA DIEU PHAI GIU NGUYEN, va moi bai duoi day do dung mot trong ba:
 *
 *   1. danh tinh van CHI den tu phien — khong lenh nao nhan `driverId`;
 *   2. XE van do MAY CHU giai — o day tu `TransportVehicleRun.vehicleId`, thu ma ke hoach dat;
 *   3. vong chay phai la vong chay CUA CHINH HO — `wasDriverEverAssignedToRun` la cong, va vai
 *      `SALE` khong the la cong vi hai lai xe khac nhau cung mang dung vai do.
 */
describe('Bam vi tri theo VONG CHAY — DOI KHANG — PROOF-022', () => {
  let repository: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let service: TrackingService;

  beforeEach(() => {
    repository = new InMemoryTrackingRepository();
    facts = new FakeCoreFacts();
    facts.drivers.set('user-a', { id: 'driver-a', fullName: 'Lai xe A' });
    facts.drivers.set('user-b', { id: 'driver-b', fullName: 'Lai xe B' });
    facts.runs.set('run-a', {
      id: 'run-a',
      code: 'VC-001',
      status: 'ACTIVE',
      vehicleId: 'vehicle-run-a',
    });
    facts.runs.set('run-b', {
      id: 'run-b',
      code: 'VC-002',
      status: 'PLANNED',
      vehicleId: 'vehicle-run-b',
    });
    facts.runs.set('run-done', {
      id: 'run-done',
      code: 'VC-099',
      status: 'COMPLETED',
      vehicleId: 'vehicle-run-c',
    });
    facts.runAssignments.set('run-a', new Set(['driver-a']));
    facts.runAssignments.set('run-b', new Set(['driver-b']));
    facts.runAssignments.set('run-done', new Set(['driver-a']));
    facts.trips.set('trip-a', { id: 'trip-a', code: 'HN-HP-01', status: 'IN_TRANSIT' });
    facts.assignments.set('trip-a', new Set(['driver-a']));
    facts.vehicles.set('trip-a', 'vehicle-1');

    service = new TrackingService(
      repository,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
      undefined,
      () => T0,
    );
  });

  const openRunA = () =>
    service.openSession({ authUserId: 'user-a', runId: 'run-a', device: null });

  it('mo phien tren vong chay cua chinh minh thi duoc, va XE do MAY CHU dien tu vong chay', async () => {
    const session = await openRunA();
    expect(session.driverId).toBe('driver-a');
    expect(session.runId).toBe('run-a');
    // CHU THE la vong chay, va KHONG mot chuyen nao bi bia ra de lam cho dua.
    expect(session.tripId).toBeNull();
    // Diem 2: khong lenh nao nhan `vehicleId`; no den tu `TransportVehicleRun.vehicleId`.
    expect(session.vehicleId).toBe('vehicle-run-a');
    expect(session.status).toBe('ACTIVE');
  });

  it('LAI XE A KHONG mo duoc phien tren vong chay cua LAI XE B', async () => {
    await expect(
      service.openSession({ authUserId: 'user-a', runId: 'run-b', device: null }),
    ).rejects.toMatchObject({ reason: 'DRIVER_NOT_ASSIGNED_TO_RUN', kind: 'DENIED' });
  });

  it('vong chay khong ton tai thi NOT_FOUND, khong phai DENIED', async () => {
    await expect(
      service.openSession({ authUserId: 'user-a', runId: 'khong-co', device: null }),
    ).rejects.toMatchObject({ reason: 'RUN_NOT_FOUND', kind: 'NOT_FOUND' });
  });

  it('vong chay DA DONG khong mo phien duoc — khong con gi de bam', async () => {
    await expect(
      service.openSession({ authUserId: 'user-a', runId: 'run-done', device: null }),
    ).rejects.toMatchObject({ reason: 'RUN_NOT_ACTIVE', kind: 'CONFLICT' });
  });

  it('mo LAI tren dung vong chay do tra ve ban cu — ung dung khoi dong lai khong phai mot loi', async () => {
    const first = await openRunA();
    const again = await openRunA();
    expect(again.id).toBe(first.id);
  });

  it('dang mo tren vong chay nay thi KHONG mo duoc tren mot chuyen khac', async () => {
    await openRunA();
    await expect(
      service.openSession({ authUserId: 'user-a', tripId: 'trip-a', device: null }),
    ).rejects.toMatchObject({ reason: 'DRIVER_HAS_ANOTHER_OPEN_SESSION', kind: 'CONFLICT' });
  });

  it('ban dinh vi van BUOC PHAI thuoc mot phien cua chinh lai xe do', async () => {
    const session = await openRunA();
    await expect(
      service.ingest({
        authUserId: 'user-b',
        sessionId: session.id,
        clientEventId: 'evt-x',
        latitude: HANOI.latitude,
        longitude: HANOI.longitude,
        accuracyMetres: 8,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: T0,
        mockLocationReported: false,
      }),
    ).rejects.toMatchObject({ reason: 'SESSION_NOT_OWNED', kind: 'DENIED' });
  });

  it('tom tat noi ra CHU THE that: dung mot trong hai khoa, khong bia chuyen', async () => {
    await openRunA();
    const summaries = await service.summariesForDriver('user-a');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.runId).toBe('run-a');
    expect(summaries[0]?.tripId).toBeNull();
  });

  it('duong CU khong doi: phien theo chuyen van mo duoc va van khong mang `runId`', async () => {
    const session = await service.openSession({
      authUserId: 'user-a',
      tripId: 'trip-a',
      device: null,
    });
    expect(session.tripId).toBe('trip-a');
    expect(session.runId).toBeNull();
    expect(session.vehicleId).toBe('vehicle-1');
  });
});

/**
 * PROOF-023 — DUNG MOT CHU THE, o ban kho TRONG BO NHO (`#327`).
 *
 * Postgres cuong che dieu nay bang `TransportTrackingSession_one_subject`, va bo
 * `run-scoped-tracking.int.spec.ts` do chinh rang buoc do tren DB that. Bai duoi day do BAN TRONG
 * BO NHO — mot duong chay THAT (`PERSISTENCE=memory`: demo, CI khong co DB), khong phai mot ban gia
 * cho test cho qua.
 *
 * Neu ban trong bo nho khong tu choi, thi mot lan ghi sai se XANH o che do nay va DO o che do kia,
 * va khong ai biet ben nao dang noi that.
 */
describe('Mot phien MOT chu the — ban trong bo nho — PROOF-023', () => {
  const base = {
    driverId: 'driver-a',
    vehicleId: null,
    deviceInstallationId: null,
    businessDate: '2026-09-07' as const,
    startedAt: T0,
    openedBy: 'test',
  };

  it('HAI chu the bi tu choi — hai duong doc co the mau thuan, va khong ai biet cai nao that', async () => {
    const repository = new InMemoryTrackingRepository();
    await expect(
      repository.createSession({ ...base, tripId: 'trip-a', runId: 'run-a' }),
    ).rejects.toThrow(/TransportTrackingSession_one_subject/);
  });

  it('KHONG chu the nao cung bi tu choi — mot chuoi toa do mo coi khong ghi duoc', async () => {
    const repository = new InMemoryTrackingRepository();
    await expect(repository.createSession({ ...base, tripId: null, runId: null })).rejects.toThrow(
      /TransportTrackingSession_one_subject/,
    );
  });

  it('dung mot chu the thi ghi duoc — ca hai chieu', async () => {
    const byTrip = new InMemoryTrackingRepository();
    const trip = await byTrip.createSession({ ...base, tripId: 'trip-a', runId: null });
    expect(trip.tripId).toBe('trip-a');
    expect(trip.runId).toBeNull();

    const byRun = new InMemoryTrackingRepository();
    const run = await byRun.createSession({ ...base, tripId: null, runId: 'run-a' });
    expect(run.runId).toBe('run-a');
    expect(run.tripId).toBeNull();
  });
});
