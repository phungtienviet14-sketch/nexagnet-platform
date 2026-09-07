import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryOperationalProofRepository,
  InMemoryProofChallengeRepository,
} from './operational-proof.repository.js';
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
 * PROOF-110 — LOI THACH THUC CUA MAY CHU.
 *
 * ============================================================================================
 * DOC KY PHAN NAY TRUOC KHI TIN VAO CO CHE
 * ============================================================================================
 *
 * NO CHUNG MINH: lan GUI chung cu xay ra trong `challengeTtlSeconds` ke tu mot lan khu hoi may chu
 * QUAN SAT DUOC. Mot chung cu lap san tu hom qua khong the mang mot `nonce` con han, vi `nonce` do
 * chua ton tai vao luc do.
 *
 * NO KHONG CHUNG MINH: rang tam anh hay ban dinh vi duoc CHUP dung luc do. Mot may khach co the
 * xin mot loi thach thuc roi dinh kem mot tam anh cu. Ket hop voi `observationId` (phai thuoc phien
 * cua chinh lai xe, mang `receivedAt` cua may chu) thi khoang co the noi doi bi thu hep — nhung no
 * KHONG bi dong. Dung tuyen bo nguoc lai (#229 §4).
 *
 * VA DUONG NGOAI TUYEN CO Y KHONG CO NO: xin mot `nonce` doi mot lan khu hoi, ma mot lai xe trong
 * vung lom thi khong co. Bat buoc se lam mat bang chung o dung doan duong bang chung co gia tri
 * nhat.
 */
describe('Loi thach thuc cua may chu — PROOF-110', () => {
  let proofs: InMemoryOperationalProofRepository;
  let challenges: InMemoryProofChallengeRepository;
  let tracking: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let service: OperationalProofService;
  let trackingService: TrackingService;
  let clock: Date;

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
    clock = new Date('2026-09-09T03:00:00Z');
    proofs = new InMemoryOperationalProofRepository();
    challenges = new InMemoryProofChallengeRepository();
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
      () => clock,
    );
    service = new OperationalProofService(
      proofs,
      tracking,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      challenges,
      DEFAULT_TRANSPORT_PROOF_POLICY,
      undefined,
      () => clock,
    );
  });

  const observeAs = async (authUserId: string, eventId: string): Promise<string> => {
    const driverId = authUserId === 'user-a' ? 'driver-a' : 'driver-b';
    const open = (await tracking.listSessionsForDriver(driverId)).find(
      (s) => s.status === 'ACTIVE',
    );
    const session =
      open ?? (await trackingService.openSession({ authUserId, tripId: 'trip-a', device: null }));
    const observation = await trackingService.ingest({
      authUserId,
      sessionId: session.id,
      clientEventId: eventId,
      ...HANOI,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS',
      capturedAt: clock,
      mockLocationReported: false,
    });
    return observation.id;
  };

  describe('phat', () => {
    it('phat duoc khi co mot phien dang mo, va han nam DUNG `challengeTtlSeconds` ve sau', async () => {
      await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');

      expect(issued.nonce.length).toBeGreaterThan(20);
      expect(issued.consumedAt).toBeNull();
      expect(issued.expiresAt.getTime() - issued.issuedAt.getTime()).toBe(
        DEFAULT_TRANSPORT_PROOF_POLICY.challengeTtlSeconds * 1000,
      );
    });

    it('KHONG phat khi chua co phien nao dang mo', async () => {
      await expect(service.issueChallenge('user-a')).rejects.toMatchObject({
        reason: 'SESSION_NOT_FOUND',
      });
    });

    it('hai lan phat ra hai `nonce` KHAC nhau', async () => {
      await observeAs('user-a', 'obs-1');
      const first = await service.issueChallenge('user-a');
      const second = await service.issueChallenge('user-a');
      expect(first.nonce).not.toBe(second.nonce);
    });
  });

  describe('tieu', () => {
    it('chung cu kem loi thach thuc con han duoc GHI NHAN la da kiem', async () => {
      const observationId = await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');

      const proof = await service.record(command({ observationId, challengeNonce: issued.nonce }));

      expect(proof.challengeVerified).toBe(true);
      const consumed = await challenges.findByNonce(issued.nonce);
      expect(consumed?.consumedAt).not.toBeNull();
      expect(consumed?.consumedByProofId).toBe(proof.id);
    });

    it('chung cu KHONG kem loi thach thuc VAN duoc ghi — duong ngoai tuyen', async () => {
      const observationId = await observeAs('user-a', 'obs-1');
      const proof = await service.record(command({ observationId }));

      // Van nhan. Chi khac o cho no khong duoc huong muc tin cay cua duong co `nonce`.
      expect(proof.id).toBeTruthy();
      expect(proof.challengeVerified).toBe(false);
    });
  });

  describe('BON cua tu choi, va moi cua co MA rieng', () => {
    it('`nonce` khong ton tai -> CHALLENGE_NOT_FOUND', async () => {
      const observationId = await observeAs('user-a', 'obs-1');
      await expect(
        service.record(command({ observationId, challengeNonce: 'toi-tu-bia-ra' })),
      ).rejects.toMatchObject({ reason: 'CHALLENGE_NOT_FOUND' });
    });

    /**
     * DAY LA BAI DO CAU "stale nonce/challenge behavior is bounded" CUA #235.
     *
     * Mot `nonce` xin luc 03:00 khong dung duoc luc 03:06 — han la 300 giay.
     */
    it('qua han -> CHALLENGE_EXPIRED, va khong ghi chung cu nao', async () => {
      const observationId = await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');

      clock = new Date(issued.expiresAt.getTime() + 1_000);

      await expect(
        service.record(command({ observationId, challengeNonce: issued.nonce })),
      ).rejects.toMatchObject({ reason: 'CHALLENGE_EXPIRED' });
      expect(await proofs.listForTrip('trip-a')).toHaveLength(0);
    });

    it('dung DUNG moc han thi cung da qua — bien la `<=`, khong phai `<`', async () => {
      const observationId = await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');

      clock = new Date(issued.expiresAt.getTime());

      await expect(
        service.record(command({ observationId, challengeNonce: issued.nonce })),
      ).rejects.toMatchObject({ reason: 'CHALLENGE_EXPIRED' });
    });

    it('dung lai mot `nonce` da tieu -> CHALLENGE_ALREADY_USED', async () => {
      const first = await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');
      await service.record(command({ observationId: first, challengeNonce: issued.nonce }));

      const second = await observeAs('user-a', 'obs-2');
      await expect(
        service.record(
          command({
            observationId: second,
            clientEventId: 'evt-2',
            challengeNonce: issued.nonce,
          }),
        ),
      ).rejects.toMatchObject({ reason: 'CHALLENGE_ALREADY_USED' });
    });

    it('`nonce` cua LAI XE KHAC -> CHALLENGE_NOT_OWNED', async () => {
      await observeAs('user-b', 'obs-b');
      const stolen = await service.issueChallenge('user-b');

      const mine = await observeAs('user-a', 'obs-a');
      await expect(
        service.record(command({ observationId: mine, challengeNonce: stolen.nonce })),
      ).rejects.toMatchObject({ reason: 'CHALLENGE_NOT_OWNED' });
    });
  });

  describe('cong chong chay dua nam o KHO, khong o mot lenh `if`', () => {
    it('hai lan tieu cung mot `nonce` thi lan thu hai tra `null`', async () => {
      await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');

      const first = await challenges.consume(issued.nonce, clock, 'proof-1');
      const second = await challenges.consume(issued.nonce, clock, 'proof-2');

      expect(first?.consumedByProofId).toBe('proof-1');
      // Neu day tra ve mot ban ghi, mot loi thach thuc se phuc vu duoc HAI chung cu.
      expect(second).toBeNull();
    });
  });

  describe('khung nhin van hanh', () => {
    it('bay ra `challengeVerified` de nguoi duyet doc duoc su khac biet', async () => {
      const withChallenge = await observeAs('user-a', 'obs-1');
      const issued = await service.issueChallenge('user-a');
      await service.record(command({ observationId: withChallenge, challengeNonce: issued.nonce }));

      const offline = await observeAs('user-a', 'obs-2');
      await service.record(command({ observationId: offline, clientEventId: 'evt-2' }));

      const views = await service.viewsForTrip('trip-a', []);
      expect(views.map((view) => view.challengeVerified).sort()).toEqual([false, true]);
    });
  });
});
