import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
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
const T1 = new Date('2026-09-08T05:00:00Z');
const HANOI = { latitude: 21.0285, longitude: 105.8542 };

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
 * PROOF-090 — BIA MO MOT CHUNG CU.
 *
 * ============================================================================================
 * VI SAO RUT MOT CHUNG CU KHONG PHAI LA XOA NO
 * ============================================================================================
 *
 * Mot chung cu sai van la mot su kien DA XAY RA: ai do da bam nut, o mot cho, vao mot luc. Xoa
 * hang di thi cau hoi "vi sao lan giao nay tung duoc tinh la xong roi lai khong?" mat luon cau
 * tra loi. Nen bia mo: hang o lai, kem `withdrawnAt` VA `withdrawnBy` (rang buoc CHECK trong
 * `20260908120000_transport_operational_proof` doi ca hai hoac khong cai nao).
 *
 * ============================================================================================
 * VA VI SAO MOT BAN DINH VI DA DUNG THI KHONG DUNG LAI DUOC — KE CA SAU KHI RUT
 * ============================================================================================
 *
 * Day la yeu cau "withdrawn/locked proof cannot be modified through a stale file/location ID"
 * cua #235. Neu rut mot chung cu ma TRA LAI ban dinh vi cho lan sau, thi rut chinh la mot cach
 * TAI CHE mot vi tri cu: dung ban dinh vi 8h sang lam chung cu cho lan giao 5h chieu. Cai khoa
 * `observationId @unique` phai la MOT CHIEU — dat mot lan, khoa vinh vien, khong mo lai bang bat
 * ky duong nao ke ca duong rut.
 */
describe('Bia mo chung cu — PROOF-090', () => {
  let proofs: InMemoryOperationalProofRepository;
  let tracking: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let service: OperationalProofService;
  let trackingService: TrackingService;

  const command = (overrides: Partial<RecordProofCommand> = {}): RecordProofCommand => ({
    authUserId: 'user-a',
    kind: 'DELIVERY',
    tripId: 'trip-a',
    observationId: '',
    clientEventId: 'evt-1',
    note: null,
    photos: [
      { locator: 'loc-1', captureMode: 'LIVE_CAMERA', contentType: 'image/jpeg', byteSize: 9 },
    ],
    ...overrides,
  });

  beforeEach(() => {
    proofs = new InMemoryOperationalProofRepository();
    tracking = new InMemoryTrackingRepository();
    facts = new FakeCoreFacts();
    facts.drivers.set('user-a', { id: 'driver-a', fullName: 'Lai xe A' });
    facts.trips.set('trip-a', { id: 'trip-a', code: 'HN-HP-01', status: 'IN_TRANSIT' });
    facts.assignments.set('trip-a', new Set(['driver-a']));

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

  const observe = async (eventId: string): Promise<string> => {
    const sessions = await tracking.listSessionsForDriver('driver-a');
    const open = sessions.find((s) => s.status === 'ACTIVE');
    const session =
      open ??
      (await trackingService.openSession({ authUserId: 'user-a', tripId: 'trip-a', device: null }));
    const observation = await trackingService.ingest({
      authUserId: 'user-a',
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

  const recorded = async (eventId = 'evt-1') => {
    const observationId = await observe(`obs-${eventId}`);
    return service.record(command({ observationId, clientEventId: eventId }));
  };

  it('rut mot chung cu thi CA chung cu VA anh cua no deu mang dau, kem NGUOI rut', async () => {
    const proof = await recorded();
    const withdrawn = await service.withdraw({
      proofId: proof.id,
      actorId: 'user-manager',
      reason: 'Anh chup nham chuyen khac',
    });

    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(withdrawn.withdrawnBy).toBe('user-manager');
    // Anh khong duoc "song sot" qua lan rut: mot tam anh con hieu luc duoi mot chung cu da rut
    // van se duoc dem trong `photoCount`, va nguoi duyet se thay mot chung cu vua bi rut vua co
    // du anh.
    expect(withdrawn.photos.every((photo) => photo.withdrawnAt !== null)).toBe(true);
    expect(withdrawn.photos.every((photo) => photo.withdrawnBy === 'user-manager')).toBe(true);
  });

  it('rut hai lan thi lan thu hai bi tu choi — khong ghi de nguoi rut dau tien', async () => {
    const proof = await recorded();
    await service.withdraw({ proofId: proof.id, actorId: 'user-manager', reason: 'lan dau' });

    await expect(
      service.withdraw({ proofId: proof.id, actorId: 'user-khac', reason: 'lan hai' }),
    ).rejects.toMatchObject({ reason: 'PROOF_ALREADY_WITHDRAWN' });

    const still = await proofs.findById(proof.id);
    expect(still?.withdrawnBy).toBe('user-manager');
  });

  it('rut mot chung cu khong ton tai la KHONG TIM THAY, khong phai mot lan rut im lang', async () => {
    await expect(
      service.withdraw({ proofId: 'khong-co', actorId: 'user-manager', reason: 'x' }),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });

  it('BAN DINH VI DA DUNG VAN BI KHOA SAU KHI RUT — khong tai che duoc vi tri cu', async () => {
    const observationId = await observe('obs-goc');
    const proof = await service.record(command({ observationId, clientEventId: 'evt-goc' }));
    await service.withdraw({ proofId: proof.id, actorId: 'user-manager', reason: 'sai' });

    // Cung ban dinh vi, mot `clientEventId` MOI — tuc mot lan bam moi that su, khong phai gui lai.
    await expect(
      service.record(command({ observationId, clientEventId: 'evt-moi' })),
    ).rejects.toMatchObject({ reason: 'PROOF_OBSERVATION_ALREADY_USED' });
  });

  it('gui lai dung `clientEventId` cu sau khi rut thi TRA VE ban da rut, khong hoi sinh no', async () => {
    const observationId = await observe('obs-replay');
    const proof = await service.record(command({ observationId, clientEventId: 'evt-replay' }));
    await service.withdraw({ proofId: proof.id, actorId: 'user-manager', reason: 'sai' });

    const replayed = await service.record(command({ observationId, clientEventId: 'evt-replay' }));
    expect(replayed.id).toBe(proof.id);
    expect(replayed.withdrawnAt).not.toBeNull();
  });

  it('khung nhin van hanh doc ra "da rut", va chung cu giao hang do mat anh thanh THIEU ANH', async () => {
    const proof = await recorded();
    const before = await service.viewsForTrip('trip-a', []);
    expect(before[0]?.withdrawn).toBe(false);
    expect(before[0]?.photoCount).toBe(1);

    await service.withdraw({ proofId: proof.id, actorId: 'user-manager', reason: 'sai' });

    const after = await service.viewsForTrip('trip-a', []);
    expect(after[0]?.withdrawn).toBe(true);
    expect(after[0]?.photoCount).toBe(0);
    expect(after[0]?.riskCodes).toContain('PHOTO_MISSING');
  });

  it('dau thoi gian rut den tu DONG HO MAY CHU, khong tu nguoi goi', async () => {
    const proof = await recorded();
    const late = new OperationalProofService(
      proofs,
      tracking,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      undefined,
      () => T1,
    );
    const withdrawn = await late.withdraw({
      proofId: proof.id,
      actorId: 'user-manager',
      reason: 'sai',
    });
    expect(withdrawn.withdrawnAt?.toISOString()).toBe(T1.toISOString());
  });
});
