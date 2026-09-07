import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { InMemoryGeofenceRepository } from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';
import { InMemoryOperationalProofRepository } from './operational-proof.repository.js';
import { OperationalProofService } from './operational-proof.service.js';
import { ProofReviewController } from './proof-review.controller.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';
import { InMemoryTrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import {
  TransportProofCoreFacts,
  type ProofDriverFacts,
  type ProofTripFacts,
} from './transport-proof-facts.port.js';

const T0 = new Date('2026-09-08T03:00:00Z');
/** Kho Hai Phong — dung lam tam mot hang rao that trong cac bai duoi. */
const DEPOT = { latitude: 20.8449, longitude: 106.6881 };

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
 * PROOF-100 — BIEN GIOI HTTP cua be mat nguoi duyet.
 *
 * Bai o day do BIEN GIOI: kiem tham so, hinh dang chu the, khoang ban kinh, va viec hang rao
 * duoc cham LUC DOC. Phep tinh phan quyet hang rao khong duoc lam lai o day —
 * `geofence.spec.ts` da do no tu B1, va nhan doi se tao hai cho cung khang dinh mot cong thuc.
 */
describe('Bien gioi HTTP cua be mat nguoi duyet — PROOF-100', () => {
  let controller: ProofReviewController;
  let geofences: InMemoryGeofenceRepository;
  let proofs: InMemoryOperationalProofRepository;
  let tracking: InMemoryTrackingRepository;
  let facts: FakeCoreFacts;
  let proofService: OperationalProofService;
  let trackingService: TrackingService;

  // Che do khong-phien: `transportActorOf` tra ve mot ten CO DINH. Du de do bien gioi.
  const request = {} as AuthenticatedRequest;

  beforeEach(() => {
    geofences = new InMemoryGeofenceRepository();
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
    proofService = new OperationalProofService(
      proofs,
      tracking,
      facts,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      undefined,
      () => T0,
    );
    controller = new ProofReviewController(
      proofService,
      new GeofenceService(geofences, DEFAULT_TRANSPORT_PROOF_POLICY),
    );
  });

  /**
   * Bat mot lan tu choi va doc MA ly do trong than phan hoi.
   *
   * Kiem bang lop (`BadRequestException`) thoi thi yeu: ba phep kiem hang rao deu tra 400, nen mot
   * bai do dung lop se van xanh khi cai nay bat nham cai kia. Ma ly do moi phan biet duoc chung.
   *
   * Va vi sao la `BadRequestException` chu khong phai `TransportDomainError`: dich vu nem loi mien,
   * roi `guard()` cua controller dich no sang HTTP qua `transportErrorToHttp`. Truoc khi luat duoc
   * don vao dich vu, controller nem THANG loi mien ra ngoai `guard()` — tuc no thoat khoi Nest
   * duoi dang mot loi khong ai bat, va thanh 500 thay vi 400.
   */
  const reasonOf = async (run: Promise<unknown>): Promise<string> => {
    try {
      await run;
      return 'KHONG BI TU CHOI';
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      const body = error.getResponse() as { reason?: string };
      return body.reason ?? 'KHONG CO MA';
    }
  };

  const fence = (overrides: Record<string, unknown> = {}) => ({
    label: 'Kho Hai Phong',
    subjectKind: 'DEPOT',
    subjectId: 'kho-hp',
    latitude: DEPOT.latitude,
    longitude: DEPOT.longitude,
    radiusMetres: 200,
    ...overrides,
  });

  /** Ghi mot chung cu giao hang THAT o mot toa do cho truoc, roi tra ve id chuyen. */
  const deliveryAt = async (latitude: number, longitude: number): Promise<string> => {
    const session = await trackingService.openSession({
      authUserId: 'user-a',
      tripId: 'trip-a',
      device: null,
    });
    const observation = await trackingService.ingest({
      authUserId: 'user-a',
      sessionId: session.id,
      clientEventId: `obs-${latitude}-${longitude}`,
      latitude,
      longitude,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS',
      capturedAt: T0,
      mockLocationReported: false,
    });
    await proofService.record({
      authUserId: 'user-a',
      kind: 'DELIVERY',
      tripId: 'trip-a',
      observationId: observation.id,
      clientEventId: `evt-${latitude}`,
      note: null,
      photos: [
        { locator: 'loc-1', captureMode: 'LIVE_CAMERA', contentType: 'image/jpeg', byteSize: 9 },
      ],
    });
    return 'trip-a';
  };

  describe('khai hang rao', () => {
    it('khai mot hang rao hop le roi doc lai duoc no', async () => {
      const created = await controller.register(request, fence());
      expect(created.id).toBeTruthy();
      expect(created.radiusMetres).toBe(200);

      const listed = await controller.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.label).toBe('Kho Hai Phong');
    });

    it('tam o (0,0) bi tu choi — mot hang rao Null Island bao MOI diem deu o ngoai', async () => {
      expect(
        await reasonOf(controller.register(request, fence({ latitude: 0, longitude: 0 }))),
      ).toBe('GEOFENCE_COORDINATE_REJECTED');
    });

    /**
     * HAI LOP KIEM, va bai nay do CA HAI vi chung tu choi o hai muc khac nhau.
     *
     * `registerGeofenceSchema` la lop HINH DANG: mot bien ngoai cung tuyet doi (10..100_000m) ma
     * duoi no thi con so khong con la mot ban kinh nua. No tra `400` truoc khi controller chay.
     *
     * Chinh sach khach la lop HEP HON, va no moi la cai co the doi theo tung khach. Neu chi do
     * bang hai gia tri ngoai bien tuyet doi thi lop nay se KHONG BAO GIO duoc chay trong bo test,
     * va mot ngay nao do co the bi xoa ma khong bai nao do — nen bai duoi dung mot chinh sach hep
     * lai, voi mot ban kinh ma lop hinh dang cho qua.
     */
    it('ban kinh ngoai BIEN TUYET DOI bi tu choi ngay o lop hinh dang', async () => {
      await expect(controller.register(request, fence({ radiusMetres: 5 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        controller.register(request, fence({ radiusMetres: 500_000 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ban kinh hop le VE HINH DANG nhung ngoai chinh sach cua khach van bi tu choi', async () => {
      const strict = new ProofReviewController(
        proofService,
        new GeofenceService(geofences, {
          ...DEFAULT_TRANSPORT_PROOF_POLICY,
          geofenceRadiusMetres: { min: 50, max: 500 },
        }),
      );

      // 20m qua duoc `.min(10)` cua lop hinh dang, nhung duoi san 50m cua khach nay.
      expect(await reasonOf(strict.register(request, fence({ radiusMetres: 20 })))).toBe(
        'GEOFENCE_RADIUS_OUT_OF_RANGE',
      );
      // 5000m cung vay o dau kia.
      expect(await reasonOf(strict.register(request, fence({ radiusMetres: 5_000 })))).toBe(
        'GEOFENCE_RADIUS_OUT_OF_RANGE',
      );
      // Va mot gia tri trong khoang cua khach thi qua ca hai lop.
      const created = await strict.register(request, fence({ radiusMetres: 200 }));
      expect(created.radiusMetres).toBe(200);
    });

    it('loai co chu the ma THIEU chu the bi tu choi', async () => {
      expect(await reasonOf(controller.register(request, fence({ subjectId: undefined })))).toBe(
        'GEOFENCE_SUBJECT_SHAPE_INVALID',
      );
    });

    it('AD_HOC ma LAI CO chu the cung bi tu choi — hinh dang sai o ca hai chieu', async () => {
      expect(
        await reasonOf(
          controller.register(request, fence({ subjectKind: 'AD_HOC', subjectId: 'kho-hp' })),
        ),
      ).toBe('GEOFENCE_SUBJECT_SHAPE_INVALID');
    });

    it('AD_HOC khong chu the thi qua', async () => {
      const created = await controller.register(
        request,
        fence({ subjectKind: 'AD_HOC', subjectId: undefined }),
      );
      expect(created.subjectKind).toBe('AD_HOC');
      expect(created.subjectId).toBeNull();
    });

    it('than yeu cau thua truong bi tu choi bang 400, khong bi bo qua im lang', async () => {
      await expect(
        controller.register(request, fence({ driverId: 'driver-b' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('doc chung cu cua mot chuyen', () => {
    it('KHONG co hang rao nao thi bao dung the, khong bao "o ngoai"', async () => {
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);
      const [view] = await controller.forTrip(tripId);
      expect(view?.geofenceVerdict).toBe('NO_FENCE');
      expect(view?.riskCodes).toContain('NO_GEOFENCE_CONFIGURED');
    });

    /**
     * BAI QUAN TRONG NHAT CUA TEP.
     *
     * Hang rao duoc khai SAU khi chung cu da duoc ghi, va phan quyet van doi. Do la he qua cua
     * viec cham luc doc — va la ly do `transport.geofence.manage` khong thuoc ve ke toan.
     */
    it('khai hang rao SAU do van doi phan quyet cua mot chung cu da ghi TRUOC do', async () => {
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);
      const before = await controller.forTrip(tripId);
      expect(before[0]?.geofenceVerdict).toBe('NO_FENCE');

      await controller.register(request, fence());

      const after = await controller.forTrip(tripId);
      expect(after[0]?.geofenceVerdict).toBe('INSIDE');
      expect(after[0]?.riskCodes).not.toContain('NO_GEOFENCE_CONFIGURED');
    });

    it('mot lan giao xa kho thi ra OUTSIDE va thanh muc dang xem lai', async () => {
      await controller.register(request, fence());
      // Ha Noi — cach kho Hai Phong khoang 90km, ngoai moi ban kinh hop ly.
      const tripId = await deliveryAt(21.0285, 105.8542);

      const [view] = await controller.forTrip(tripId);
      expect(view?.geofenceVerdict).toBe('OUTSIDE');
      expect(view?.riskCodes).toContain('OUTSIDE_EXPECTED_GEOFENCE');
      expect(view?.highestSeverity).toBe('REVIEW');
    });

    it('khung nhin KHONG mang theo mot toa do nao ra ngoai', async () => {
      await controller.register(request, fence());
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);

      const views = await controller.forTrip(tripId);
      const serialised = JSON.stringify(views);
      expect(serialised).not.toContain(String(DEPOT.latitude));
      expect(serialised).not.toContain(String(DEPOT.longitude));
    });
  });

  describe('bia mo qua duong HTTP', () => {
    it('rut xong thi tra ve dau thoi gian VA nguoi rut', async () => {
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);
      const [view] = await controller.forTrip(tripId);
      const proofId = view?.id ?? '';

      const result = await controller.withdraw(request, proofId, { reason: 'Anh nham chuyen' });
      expect(result.withdrawnAt).not.toBeNull();
      expect(result.withdrawnBy).toBeTruthy();
    });

    it('ly do rong bi tu choi — mot lan rut khong ly do buoc nguoi doc sau nay phai doan', async () => {
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);
      const [view] = await controller.forTrip(tripId);

      await expect(
        controller.withdraw(request, view?.id ?? '', { reason: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('thieu han truong `reason` cung bi tu choi, khong tu dien mot chuoi rong', async () => {
      const tripId = await deliveryAt(DEPOT.latitude, DEPOT.longitude);
      const [view] = await controller.forTrip(tripId);

      await expect(controller.withdraw(request, view?.id ?? '', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
