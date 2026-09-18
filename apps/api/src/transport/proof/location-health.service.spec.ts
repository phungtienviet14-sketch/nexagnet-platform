import { beforeEach, describe, expect, it } from 'vitest';
import { assertBusinessDate } from '../business-date.js';
import { LocationHealthService } from './location-health.service.js';
import {
  UnconfiguredVehicleTelematicsAdapter,
  VehicleTelematicsPort,
  type TelematicsAvailability,
  type TelematicsFix,
  type TelematicsQuery,
} from './telematics/vehicle-telematics.port.js';
import {
  DEFAULT_HEALTHY_SILENCE_SECONDS,
  DEFAULT_LOST_SILENCE_SECONDS,
  DEFAULT_TRANSPORT_PROOF_POLICY,
} from './tracking-policy.js';
import { InMemoryTrackingRepository } from './tracking.repository.js';
import type { LocationSource } from './tracking.types.js';

/**
 * `#297 T10.5-T10.10` o TANG DICH VU — lap dau vao tu su that DA GHI.
 *
 * Bo bai o `location-health.spec.ts` da khoa PHEP CHAM. Bo nay khoa ba dieu khac, va chung chi
 * hong duoc o tang nay:
 *
 *   1. ky vong den tu PHIEN DANG MO cua chiec xe — khong tu than yeu cau, khong tu mot co;
 *   2. ban dinh vi den tu ban moi nhat cua TUNG NGUON — mot dien thoai bam lien tuc khong duoc
 *      che khuat mot hop GSHT da im;
 *   3. mot cong telematics NEM khong duoc lam ca phep cham chet.
 */
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };
const NOW = new Date('2026-09-07T03:00:00Z');
const BUSINESS_DATE = assertBusinessDate('2026-09-07');
const HEALTHY = DEFAULT_HEALTHY_SILENCE_SECONDS;
const LOST = DEFAULT_LOST_SILENCE_SECONDS;

const agedBy = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);

/** Cong gia — co nha cung cap VA chiec xe co dang ky; khong bao gio tra ve mot ban dinh vi nao. */
class ConfiguredTelematicsStub extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    return { available: true, providerName: 'NHA-CUNG-CAP-KIEM-THU' };
  }

  describeVehicle(_vehicleId: string): TelematicsAvailability {
    return { available: true, providerName: 'NHA-CUNG-CAP-KIEM-THU' };
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    return [];
  }
}

/**
 * Cong ke MOT danh sach xe co thiet bi — hinh dang THAT cua mot doi xe.
 *
 * Ton tai de khoa mot loi pham vi: khach DA ky voi nha cung cap (`describe().available === true`)
 * nhung khong phai chiec xe nao cung gan hop. Cong nay dem ca so lan bi hoi o muc khach, de mot
 * bai kiem chung minh duoc rang phep cham suc khoe KHONG hoi nham cau do.
 */
class EnrolmentAwareTelematicsStub extends VehicleTelematicsPort {
  providerLevelCalls = 0;

  constructor(private readonly enrolled: ReadonlySet<string>) {
    super();
  }

  describe(): TelematicsAvailability {
    this.providerLevelCalls += 1;
    return { available: true, providerName: 'NHA-CUNG-CAP-KIEM-THU' };
  }

  describeVehicle(vehicleId: string): TelematicsAvailability {
    return this.enrolled.has(vehicleId)
      ? { available: true, providerName: 'NHA-CUNG-CAP-KIEM-THU' }
      : { available: false, reason: 'VEHICLE_NOT_ENROLLED' };
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    return [];
  }
}

/** Cong HONG — hoi gi cung nem. Mot adapter that phai goi ra mang de tra loi cau nay. */
class ThrowingTelematicsStub extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    throw new Error('nha cung cap khong tra loi');
  }

  describeVehicle(_vehicleId: string): TelematicsAvailability {
    throw new Error('nha cung cap khong tra loi');
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    throw new Error('nha cung cap khong tra loi');
  }
}

let repository: InMemoryTrackingRepository;
let eventSeq = 0;

const serviceWith = (telematics: VehicleTelematicsPort): LocationHealthService =>
  new LocationHealthService(
    repository,
    telematics,
    DEFAULT_TRANSPORT_PROOF_POLICY,
    undefined,
    () => NOW,
  );

const service = (): LocationHealthService =>
  serviceWith(new UnconfiguredVehicleTelematicsAdapter());

const openSession = async (
  vehicleId: string | null,
  startedSecondsAgo = 3_600,
  driverId = 'driver-1',
) =>
  repository.createSession({
    driverId,
    tripId: 'trip-1',
    vehicleId,
    deviceInstallationId: null,
    businessDate: BUSINESS_DATE,
    startedAt: agedBy(startedSecondsAgo),
    openedBy: 'driver-1',
  });

const observe = async (
  sessionId: string,
  source: LocationSource,
  ageSeconds: number,
  point = HANOI,
) => {
  eventSeq += 1;
  return repository.appendObservation({
    sessionId,
    clientEventId: `event-${eventSeq}`,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMetres: 8,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    source,
    capturedAt: agedBy(ageSeconds),
    receivedAt: agedBy(ageSeconds),
    clockSkewSeconds: 0,
    mockLocationReported: null,
    businessDate: BUSINESS_DATE,
  });
};

/**
 * BAN TU PHAN CUNG TREN XE — qua duong ghi THAT, tuc gan THANG vao chiec xe.
 *
 * ============================================================================================
 * TRUOC `#297` T4, NHUNG BAI DUOI DAY DUNG `observe(session.id, 'TELEMATICS', ...)`
 * ============================================================================================
 *
 * Tuc chung dung mot ban ghi cua PHIEN DIEN THOAI roi dan nhan `TELEMATICS` len. Cac bai van xanh,
 * va phep cham van dung — nhung thu chung chung minh thi khong phai thu he thong lam duoc: tren
 * `main` luc do khong mot duong nao ghi noi mot ban `TELEMATICS` that, va duong DUY NHAT co the
 * ghi ra no la be mat lai xe (`transport.driver.self.tracking.report`), tuc chinh chiec dien thoai
 * dang bi doi chieu.
 *
 * Bay gio chung di qua `appendTelematicsObservation` — cung ham ma `TelematicsIngressService` goi
 * — nen `SOURCE_FALLBACK` va `ALL_SOURCES_LOST` duoc chung minh tren dung hinh dang du lieu ma san
 * pham sinh ra: `sessionId === null`, `vehicleId` khac null. Va o Postgres,
 * `TransportLocationObservation_telematics_subject` lam cho hinh dang CU khong ghi duoc nua.
 */
const observeTelematics = async (vehicleId: string, ageSeconds: number, point = HAIPHONG) => {
  eventSeq += 1;
  return repository.appendTelematicsObservation({
    providerId: 'nha-cung-cap-kiem-thu',
    externalEventId: `fix-${eventSeq}`,
    vehicleId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMetres: 8,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    capturedAt: agedBy(ageSeconds),
    receivedAt: agedBy(ageSeconds),
    clockSkewSeconds: 0,
    businessDate: BUSINESS_DATE,
  });
};

beforeEach(() => {
  repository = new InMemoryTrackingRepository();
  eventSeq = 0;
});

describe('ky vong den tu PHIEN, khong tu than yeu cau', () => {
  it('chiec xe khong co phien nao dang mo -> NOT_TRACKED', async () => {
    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('NOT_TRACKED');
    expect(health.reason).toBe('TRACKING_NOT_EXPECTED');
  });

  it('phien DA DONG khong con la mot ky vong -> NOT_TRACKED, khong phai LOST', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await repository.closeSession(session.id, agedBy(60), 'DRIVER_STOPPED');

    const health = await service().forVehicle('vehicle-1');

    // Lai xe da bam "ket thuc". Khong con ai doi vi tri chiec xe do, nen bao "mat GPS" la sai.
    expect(health.status).toBe('NOT_TRACKED');
    expect(health.lastKnown).toBeNull();
  });

  it('phien cua mot CHIEC XE KHAC khong mo ky vong cho xe nay', async () => {
    const session = await openSession('vehicle-2');
    await observe(session.id, 'DEVICE_GNSS', 60);

    expect((await service().forVehicle('vehicle-1')).status).toBe('NOT_TRACKED');
    expect((await service().forVehicle('vehicle-2')).status).toBe('LIVE');
  });

  it('phien chua gan xe (`vehicleId: null`) khong mo ky vong cho bat ky xe nao', async () => {
    const session = await openSession(null);
    await observe(session.id, 'DEVICE_GNSS', 60);

    expect((await service().forVehicle('vehicle-1')).status).toBe('NOT_TRACKED');
  });

  it('moc do cuoc cho la `startedAt` cua phien', async () => {
    // Phien vua mo 30 giay truoc, chua ban nao -> dang cho, KHONG phai mat.
    await openSession('vehicle-1', 30);
    expect((await service().forVehicle('vehicle-1')).reason).toBe('AWAITING_FIRST_OBSERVATION');

    repository = new InMemoryTrackingRepository();
    // Phien mo tu lau ma chua he co ban nao -> mat, kem ma RIENG.
    await openSession('vehicle-1', LOST + 1);
    expect((await service().forVehicle('vehicle-1')).reason).toBe('NO_OBSERVATION_RECEIVED');
  });
});

describe('ban dinh vi den tu ban moi nhat cua TUNG NGUON', () => {
  it('dien thoai bam lien tuc KHONG che khuat mot hop GSHT da im', async () => {
    const session = await openSession('vehicle-1');
    // Muoi ban dien thoai moi hon ban telematics duy nhat. Neu tang duoi lay "N ban moi nhat" thi
    // ban telematics bi day ra khoi danh sach va mot nguon con song bi bao mat.
    await observeTelematics('vehicle-1', 120);
    for (let index = 0; index < 10; index += 1) {
      await observe(session.id, 'DEVICE_GNSS', 30 + index);
    }

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');
    const telematics = health.sources.find((source) => source.family === 'TELEMATICS');

    expect(telematics?.status).toBe('LIVE');
    expect(telematics?.ageSeconds).toBe(120);
  });

  it('T10.6 — dien thoai mat, hop GSHT con bao -> SOURCE_FALLBACK', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await observeTelematics('vehicle-1', 120);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('SOURCE_FALLBACK');
    expect(health.currentSource).toBe('TELEMATICS');
    expect(health.lastKnown?.point).toEqual(HAIPHONG);
    expect(health.lastKnown?.usableAsCurrent).toBe(true);
  });

  it('T10.7 — dien thoai moi, hop GSHT cu -> dien thoai van la nguon hien tai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);
    await observeTelematics('vehicle-1', LOST + 1);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('LIVE');
    expect(health.currentSource).toBe('PHONE');
    expect(health.lastKnown?.point).toEqual(HANOI);
  });

  it('T10.8 — ca hai nguon mat -> ALL_SOURCES_LOST kem bang chung cuoi', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 600);
    await observeTelematics('vehicle-1', LOST + 1);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('ALL_SOURCES_LOST');
    expect(health.lastKnown?.usableAsCurrent).toBe(false);
    expect(health.lastKnown?.ageSeconds).toBe(LOST + 1);
  });

  it('`receivedAt` la su that, KHONG phai `capturedAt`', async () => {
    const session = await openSession('vehicle-1');
    // Mot may bi chinh dong ho: `capturedAt` bao vua xong, nhung may chu nhan tu rat lau roi.
    await repository.appendObservation({
      sessionId: session.id,
      clientEventId: 'lech-dong-ho',
      latitude: HANOI.latitude,
      longitude: HANOI.longitude,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS',
      capturedAt: NOW,
      receivedAt: agedBy(LOST + 1),
      clockSkewSeconds: LOST + 1,
      mockLocationReported: null,
      businessDate: BUSINESS_DATE,
    });

    const health = await service().forVehicle('vehicle-1');

    // Neu tang nay doc `capturedAt`, mot may chinh gio se tu bao minh con song.
    expect(health.status).toBe('LOST');
    expect(health.ageSeconds).toBe(LOST + 1);
  });

  it('ban NHAP TAY khong lam chiec xe song lai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await observe(session.id, 'MANUAL', 1, HAIPHONG);

    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('LOST');
    expect(health.lastKnown?.source).toBe('DEVICE_GNSS');
  });
});

describe('cong telematics khong san sang', () => {
  it('T10.9 — adapter MAC DINH (chua khai nha cung cap) -> nguon do la NOT_CONFIGURED', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const health = await service().forVehicle('vehicle-1');
    const telematics = health.sources.find((source) => source.family === 'TELEMATICS');

    expect(health.status).toBe('LIVE');
    expect(telematics?.status).toBe('NOT_CONFIGURED');
  });

  it('chua khai nha cung cap thi KHONG BAO GIO bao "mat ca hai nguon"', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);

    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('LOST');
    expect(health.status).not.toBe('ALL_SOURCES_LOST');
  });

  it('T10.10 — `describe()` NEM -> khong sap, va coi nhu chua khai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const health = await serviceWith(new ThrowingTelematicsStub()).forVehicle('vehicle-1');

    // Cau tra loi an toan la "chua khai": no dan toi mot canh bao that (`LOST`) chu khong dan toi
    // `ALL_SOURCES_LOST` (bao qua) hay mot trang thai binh thuong gia (bao thieu).
    expect(health.status).toBe('LIVE');
    expect(health.sources.find((source) => source.family === 'TELEMATICS')?.status).toBe(
      'NOT_CONFIGURED',
    );
  });
});

/**
 * HOI QUY — soat doc lap 13/09/2026, finding 1 (P1).
 *
 * Loi that: `compute()` lay ky vong tu PHIEN DANG MO, nhung lay ban dinh vi tu TOAN BO lich su
 * chiec xe. Hai truc khac nhau tren cung mot ket qua, nen mot ban cua ca lai HOM QUA tra loi thay
 * cho mot phien vua mo ba muoi giay truoc.
 */
describe('ban dinh vi cua PHIEN CU khong tra loi thay cho PHIEN MOI', () => {
  /** Dung kich ban cua ban soat: phien cu co ban PHONE, phien moi vua mo va chua co gi. */
  const previousSessionThenFresh = async (previousObservationAgeSeconds: number) => {
    const previous = await openSession('vehicle-1', previousObservationAgeSeconds + 60);
    await observe(previous.id, 'DEVICE_GNSS', previousObservationAgeSeconds);
    await repository.closeSession(previous.id, agedBy(45), 'DRIVER_STOPPED');
    return openSession('vehicle-1', 30);
  };

  it('phien moi mo 30 giay truoc, ban cu cach 2 gio -> AWAITING_FIRST chu khong LOST', async () => {
    await previousSessionThenFresh(7_200);

    const health = await service().forVehicle('vehicle-1');

    // Truoc khi sua: ban 2 gio truoc bi nhat len, cham `LOST`, va he bao mat GPS ngay giay dau
    // tien cua mot phien vua mo. Dung ra la con dang cho ban dau tien.
    expect(health.status).toBe('DEGRADED');
    expect(health.reason).toBe('AWAITING_FIRST_OBSERVATION');
    expect(health.sources.find((source) => source.family === 'PHONE')?.status).toBe(
      'AWAITING_FIRST',
    );
  });

  it('ban cua phien cu khong duoc dung lam bang chung cuoi cua phien moi', async () => {
    await previousSessionThenFresh(7_200);

    const health = await service().forVehicle('vehicle-1');

    // Khong phai "cu nhung van ve duoc": no thuoc ve mot ky vong DA DONG, nen no khong duoc phat
    // ra kem mot cau tra loi ve ky vong dang mo.
    expect(health.lastKnown).toBeNull();
    expect(health.lastReceivedAt).toBeNull();
    expect(health.ageSeconds).toBeNull();
  });

  it('ban cu VAN BI LOAI du no rat moi, chi vi no nam truoc moc phien', async () => {
    // 60 giay truoc la thua trong cua so lanh manh. Neu loc bang NGUONG TUOI thay vi bang MOC
    // PHIEN, bai nay se xanh nham va loi that van con.
    await previousSessionThenFresh(60);

    const health = await service().forVehicle('vehicle-1');

    expect(health.status).not.toBe('LIVE');
    expect(health.reason).toBe('AWAITING_FIRST_OBSERVATION');
  });

  it('ban den DUNG giay phien mo van duoc tinh (bien `>=`)', async () => {
    const session = await openSession('vehicle-1', 300);
    await observe(session.id, 'DEVICE_GNSS', 300);

    const health = await service().forVehicle('vehicle-1');

    // Ban dau tien cua chinh phien do. Cat bang `>` se vut no di va bao "dang cho" mai mai.
    expect(health.status).toBe('LIVE');
    expect(health.ageSeconds).toBe(300);
  });

  it('ban TELEMATICS nhan TRUOC ky vong khong dung len mot SOURCE_FALLBACK gia', async () => {
    // Ban telematics nay con RAT MOI (120 giay) — thua trong cua so lanh manh. Do chinh la dieu
    // lam bai nay phan biet duoc: khong chan theo moc ky vong thi no cham `LIVE` va keo ca ket qua
    // thanh `SOURCE_FALLBACK`, tuc man hinh bao *"phan cung tren xe dang bao"* cho mot phien chua
    // nhan duoc gi. Neu de ban nay cu (qua cua so mat) thi ca hai duong deu ra cung ket qua va bai
    // kiem khong chung minh duoc gi.
    //
    // Ban tu phan cung KHONG thuoc phien nao ca, nen cua chan duy nhat la MOC THOI GIAN cua ky
    // vong dang mo — va do dung la luoi ma bai nay kiem.
    const previous = await openSession('vehicle-1', 180);
    await observeTelematics('vehicle-1', 120);
    await repository.closeSession(previous.id, agedBy(45), 'DRIVER_STOPPED');
    await openSession('vehicle-1', 30);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    // `SOURCE_FALLBACK` noi *"dien thoai im nhung phan cung tren xe CON BAO"*. Mot ban tu ca lai
    // hom truoc khong chung minh dieu do.
    expect(health.status).not.toBe('SOURCE_FALLBACK');
    expect(health.currentSource).toBeNull();
    expect(health.reason).toBe('AWAITING_FIRST_OBSERVATION');
    expect(health.sources.find((source) => source.family === 'TELEMATICS')?.status).toBe(
      'AWAITING_FIRST',
    );
  });

  it('phien dang chay cua xe KHAC khong lan sang chiec xe nay', async () => {
    const other = await openSession('vehicle-2', 600, 'driver-2');
    await observe(other.id, 'DEVICE_GNSS', 10);
    await previousSessionThenFresh(7_200);

    const health = await service().forVehicle('vehicle-1');

    expect(health.reason).toBe('AWAITING_FIRST_OBSERVATION');
    expect((await service().forVehicle('vehicle-2')).status).toBe('LIVE');
  });
});

/**
 * HOI QUY — soat doc lap 13/09/2026, finding 2 (P1, kien truc).
 *
 * Loi that: `telematicsConfigured()` doc `describe().available` — mot cau tra loi o muc KHACH —
 * roi dung no nhu trang thai cua MOT CHIEC XE. Hom nay khong lo ra, vi adapter mac dinh luon tra
 * `false`; no lo ra dung ngay mot nha cung cap that duoc cam vao.
 */
describe('telematics duoc hoi theo XE, khong theo khach', () => {
  const ENROLLED = new Set(['vehicle-1']);

  it('nha cung cap CO san sang nhung xe CHUA dang ky -> NOT_CONFIGURED', async () => {
    const session = await openSession('vehicle-2', 3_600, 'driver-2');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const health = await serviceWith(new EnrolmentAwareTelematicsStub(ENROLLED)).forVehicle(
      'vehicle-2',
    );

    expect(health.sources.find((source) => source.family === 'TELEMATICS')?.status).toBe(
      'NOT_CONFIGURED',
    );
  });

  it('xe CHUA dang ky + dien thoai mat -> LOST, KHONG phai ALL_SOURCES_LOST', async () => {
    const session = await openSession('vehicle-2', LOST + 600, 'driver-2');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);

    const health = await serviceWith(new EnrolmentAwareTelematicsStub(ENROLLED)).forVehicle(
      'vehicle-2',
    );

    // Day la ca canh bao sai ma finding 2 canh bao: mot chiec xe khong gan hop GSHT bi ket luan la
    // mat mot nguon phan cung chua bao gio ton tai tren no.
    expect(health.status).toBe('LOST');
    expect(health.status).not.toBe('ALL_SOURCES_LOST');
  });

  it('xe DA dang ky + ca hai nguon mat -> ALL_SOURCES_LOST (canh bao that van phai ra)', async () => {
    const session = await openSession('vehicle-1', LOST + 600);
    await observe(session.id, 'DEVICE_GNSS', LOST + 600);
    await observeTelematics('vehicle-1', LOST + 1);

    const health = await serviceWith(new EnrolmentAwareTelematicsStub(ENROLLED)).forVehicle(
      'vehicle-1',
    );

    // Loi ngu y cua ban va: neu "coi nhu chua khai" duoc ap cho MOI xe thi bai tren xanh ma canh
    // bao that cung tat luon. Phai tach duoc hai chieu.
    expect(health.status).toBe('ALL_SOURCES_LOST');
  });

  it('phep cham KHONG hoi cau hoi muc khach (`describe()`)', async () => {
    const port = new EnrolmentAwareTelematicsStub(ENROLLED);
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    await serviceWith(port).forVehicle('vehicle-1');

    // Khong phai mot bai kiem ve hieu nang: chinh viec goi `describe()` o duong nay LA loi kien
    // truc. Dem so lan goi la cach duy nhat khoa duoc dieu do tu ben ngoai.
    expect(port.providerLevelCalls).toBe(0);
  });

  it('`describeVehicle()` NEM -> khong sap, va coi nhu chua khai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);

    const health = await serviceWith(new ThrowingTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('LOST');
    expect(health.sources.find((source) => source.family === 'TELEMATICS')?.status).toBe(
      'NOT_CONFIGURED',
    );
  });
});

describe('doc nhieu lan KHONG ghi mot dong nao', () => {
  it('ba lan hoi lien tiep khong tao them phien hay ban dinh vi nao', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const before = (await repository.listObservations(session.id)).length;
    const sessionsBefore = (await repository.listSessionsForTrip('trip-1')).length;

    await service().forVehicle('vehicle-1');
    await service().forVehicle('vehicle-1');
    await service().forVehicle('vehicle-1');

    expect((await repository.listObservations(session.id)).length).toBe(before);
    expect((await repository.listSessionsForTrip('trip-1')).length).toBe(sessionsBefore);
  });

  it('cung su that + cung dong ho -> cung ket qua (T11.6: suy lai duoc sau khoi dong lai)', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', HEALTHY + 1);

    const first = await service().forVehicle('vehicle-1');
    // Mot the hien MOI cua dich vu — khong mang theo trang thai nao trong bo nho.
    const second = await service().forVehicle('vehicle-1');

    expect(second).toEqual(first);
  });
});
