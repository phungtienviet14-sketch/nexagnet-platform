import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryOperationalProofRepository } from './operational-proof.repository.js';
import { OperationalProofService } from './operational-proof.service.js';
import type { RecordProofCommand } from './operational-proof.types.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';
import { InMemoryTrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import {
  TransportProofCoreFacts,
  type ProofDriverFacts,
  type ProofTripFacts,
} from './transport-proof-facts.port.js';

const T0 = new Date('2026-09-08T03:00:00Z');
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const DEPOT = { id: 'kho', centre: { latitude: 20.8449, longitude: 106.6881 }, radiusMetres: 200 };

class FakeCoreFacts extends TransportProofCoreFacts {
  readonly drivers = new Map<string, ProofDriverFacts>();
  readonly trips = new Map<string, ProofTripFacts>();
  readonly assignments = new Map<string, Set<string>>();

  async findDriverByAuthUserId(authUserId: string): Promise<ProofDriverFacts | null> {
    return this.drivers.get(authUserId) ?? null;
  }
  async findTrip(tripId: string): Promise<ProofTripFacts | null> {
    return this.trips.get(tripId) ?? null;
  }
  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    return this.assignments.get(tripId)?.has(driverId) ?? false;
  }
  async activeVehicleForTrip(): Promise<string | null> {
    return null;
  }
}

/**
 * PROOF-060 — chung cu van hanh.
 *
 * Hai quy tac cua ho so B (`#232 D-08`) duoc cuong che o DICH VU, khong o giao dien: bat dau bat
 * buoc co vi tri; giao hang bat buoc co vi tri VA anh. Va mot dieu thu ba khong nam trong #232
 * nhung suy ra truc tiep tu no: vi tri do phai la vi tri CUA CHINH NGUOI LAP chung cu.
 */
describe('Chung cu van hanh — PROOF-060', () => {
  let proofs: InMemoryOperationalProofRepository;
  let tracking: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let service: OperationalProofService;
  let trackingService: TrackingService;

  const photo = (captureMode: 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN' = 'LIVE_CAMERA') => ({
    locator: `loc-${captureMode}`,
    captureMode,
    contentType: 'image/jpeg',
    byteSize: 1024,
  });

  const command = (overrides: Partial<RecordProofCommand> = {}): RecordProofCommand => ({
    authUserId: 'user-a',
    kind: 'DELIVERY',
    tripId: 'trip-a',
    observationId: '',
    clientEventId: 'evt-proof-1',
    note: null,
    photos: [photo()],
    ...overrides,
  });

  beforeEach(() => {
    proofs = new InMemoryOperationalProofRepository();
    tracking = new InMemoryTrackingRepository();
    facts = new FakeCoreFacts();
    facts.drivers.set('user-a', { id: 'driver-a', fullName: 'Lai xe A' });
    facts.drivers.set('user-b', { id: 'driver-b', fullName: 'Lai xe B' });
    facts.trips.set('trip-a', { id: 'trip-a', code: 'HN-HP-01', status: 'IN_TRANSIT' });
    facts.assignments.set('trip-a', new Set(['driver-a', 'driver-b']));

    trackingService = new TrackingService(
      tracking,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
      undefined,
      () => T0,
    );
    service = new OperationalProofService(
      proofs,
      tracking,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      undefined,
      () => T0,
    );
  });

  const observeAs = async (authUserId: string, eventId: string): Promise<string> => {
    const session = await trackingService.openSession({
      authUserId,
      tripId: 'trip-a',
      device: null,
    });
    const observation = await trackingService.ingest({
      authUserId,
      sessionId: session.id,
      clientEventId: eventId,
      latitude: HANOI.latitude,
      longitude: HANOI.longitude,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS',
      capturedAt: T0,
      mockLocationReported: false,
    });
    return observation.id;
  };

  it('BAT DAU ghi duoc ma khong can anh', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    const proof = await service.record(command({ kind: 'START', observationId, photos: [] }));
    expect(proof.kind).toBe('START');
    expect(proof.photos).toHaveLength(0);
    expect(proof.observationId).toBe(observationId);
  });

  it('GIAO HANG KHONG CO ANH thi bi tu choi — ho so B bat buoc', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await expect(
      service.record(command({ kind: 'DELIVERY', observationId, photos: [] })),
    ).rejects.toMatchObject({ reason: 'PROOF_PHOTO_REQUIRED', kind: 'INVALID' });
  });

  it('anh chi co khoang trang cung khong tinh la anh', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await expect(
      service.record(command({ observationId, photos: [{ ...photo(), locator: '   ' }] })),
    ).rejects.toMatchObject({ reason: 'PROOF_PHOTO_REQUIRED' });
  });

  it('GIAO HANG co anh thi ghi duoc, va giu nguyen cach chup', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    const proof = await service.record(command({ observationId }));
    expect(proof.photos).toHaveLength(1);
    expect(proof.photos[0]?.captureMode).toBe('LIVE_CAMERA');
  });

  it('anh LAY TU THU VIEN VAN duoc nhan — no chi khong duoc cung muc tin cay', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    const proof = await service.record(command({ observationId, photos: [photo('GALLERY')] }));
    expect(proof.id).toBeTruthy();
    const [view] = await service.viewsForTrip('trip-a', [DEPOT]);
    expect(view?.riskCodes).toContain('PHOTO_FROM_GALLERY');
    expect(view?.photosByCaptureMode).toEqual({ GALLERY: 1 });
  });

  it('LAI XE A KHONG muon duoc ban dinh vi cua LAI XE B lam bang chung', async () => {
    const observationOfB = await observeAs('user-b', 'obs-b');
    await expect(
      service.record(command({ authUserId: 'user-a', observationId: observationOfB })),
    ).rejects.toMatchObject({ reason: 'PROOF_OBSERVATION_NOT_OWNED', kind: 'DENIED' });
  });

  it('lai xe chua duoc phan cong thi khong lap duoc chung cu', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    facts.assignments.set('trip-a', new Set(['driver-b']));
    await expect(service.record(command({ observationId }))).rejects.toMatchObject({
      reason: 'PROOF_DRIVER_NOT_ASSIGNED',
    });
  });

  it('ban dinh vi khong ton tai thi NOT_FOUND', async () => {
    await expect(service.record(command({ observationId: 'khong-co' }))).rejects.toMatchObject({
      reason: 'PROOF_OBSERVATION_NOT_FOUND',
      kind: 'NOT_FOUND',
    });
  });

  it('mot lan bam gui lai KHONG tao chung cu thu hai', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    const first = await service.record(command({ observationId }));
    const again = await service.record(command({ observationId }));
    expect(again.id).toBe(first.id);
    expect(await proofs.listForTrip('trip-a')).toHaveLength(1);
  });

  it('MOT ban dinh vi khong dung lai duoc cho chung cu thu hai', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await service.record(command({ kind: 'START', observationId, photos: [] }));
    await expect(
      service.record(command({ kind: 'DELIVERY', observationId, clientEventId: 'evt-2' })),
    ).rejects.toMatchObject({ reason: 'PROOF_OBSERVATION_ALREADY_USED', kind: 'CONFLICT' });
  });

  it('khung nhin van hanh KHONG mang mot toa do nao', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await service.record(command({ observationId }));
    const views = await service.viewsForTrip('trip-a', [DEPOT]);
    const serialised = JSON.stringify(views);
    expect(serialised).not.toContain('105.85');
    expect(serialised).not.toContain('21.02');
  });

  it('giao hang NGOAI hang rao ky vong len REVIEW', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await service.record(command({ observationId }));
    const [view] = await service.viewsForTrip('trip-a', [DEPOT]);
    expect(view?.geofenceVerdict).toBe('OUTSIDE');
    expect(view?.riskCodes).toContain('OUTSIDE_EXPECTED_GEOFENCE');
    expect(view?.highestSeverity).toBe('REVIEW');
  });

  it('CHUA KHAI hang rao nao thi noi ro la chua khai, khong gia vo la "ngoai"', async () => {
    const observationId = await observeAs('user-a', 'obs-1');
    await service.record(command({ observationId }));
    const [view] = await service.viewsForTrip('trip-a', []);
    expect(view?.geofenceVerdict).toBe('NO_FENCE');
    expect(view?.riskCodes).toContain('NO_GEOFENCE_CONFIGURED');
    expect(view?.riskCodes).not.toContain('OUTSIDE_EXPECTED_GEOFENCE');
  });
});
