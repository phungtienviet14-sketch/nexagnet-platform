import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../config/prisma.service.js';
import { PrismaFleetRepository } from '../../fleet/prisma-fleet.repository.js';
import { isUniqueViolationOn } from '../../storage-conflict.js';
import { PrismaTripRepository } from '../../trips/prisma-trip.repository.js';
import { PrismaTrackingRepository } from '../prisma-tracking.repository.js';
import { TELEMATICS_INGRESS_EVENT } from '../proof-storage-conflict.js';

/**
 * PROOF-051 — BAT BIEN cua cua nhap telematics, tren Postgres THAT (`#297` T4/T9).
 *
 * `telematics-ingress-storage.spec.ts` chung minh cac rang buoc CO TEN trong tep migration. Bo nay
 * chung minh chung THAT SU TU CHOI du lieu sai. Hai viec khac nhau: mot ten con nguyen trong tep van
 * co the la mot rang buoc chua bao gio duoc ap, va mot `CHECK` viet sai dieu kien van "ton tai" ma
 * khong chan gi.
 *
 * Bai quan trong nhat la bai `TELEMATICS` co `sessionId`: do la hinh dang ma MOI bo bai truoc lane
 * nay dung de gia lap mot nguon thu hai, va tu day no khong ghi duoc nua. Neu bai do do, nghia la
 * mot chiec dien thoai lai co the tu khai minh la phan cung tren xe.
 *
 * `describe.runIf` theo dung quy uoc: khong co DB thi bo qua thay vi do — nhung do cung co nghia la
 * "xanh o may" KHONG phu nhung bai nay. Chung chay o job `integration` cua CI.
 *
 * Tien to `ITTELE` KHONG long nhau voi `ITPROOF`/`ITWDRAW`/`ITLHEAL` — `cleanup` dung `startsWith`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Cua nhap telematics (Postgres)', () => {
  const prisma = new PrismaService();
  const tracking = new PrismaTrackingRepository(prisma);
  const fleet = new PrismaFleetRepository(prisma);
  const trips = new PrismaTripRepository(prisma);

  const PLATE = 'ITTELE-0001';
  const TRIP_CODE = 'ITTELE-TR-1';
  const DRIVER_PHONE = '0955ITTELEA';
  const BUSINESS_DATE = '2026-09-18';
  const PROVIDER = 'ittele-dau-noi';
  const RECORDED = new Date('2026-09-18T02:00:00Z');

  let vehicleId = '';
  let sessionId = '';

  async function cleanup(): Promise<void> {
    // Thu tu BAT BUOC: hang so bien gioi tro toi ban dinh vi bang `onDelete: Restrict`, va ban dinh
    // vi gan thang vao xe cung `Restrict` — bo sot mot buoc thi lan xoa xe that bai va fixture ban
    // o lai cho moi lan chay sau.
    await prisma.transportTelematicsIngressEvent.deleteMany({
      where: { vehicle: { registrationPlate: PLATE } },
    });
    await prisma.transportLocationObservation.deleteMany({
      where: { vehicle: { registrationPlate: PLATE } },
    });
    await prisma.transportLocationObservation.deleteMany({
      where: { session: { trip: { code: TRIP_CODE } } },
    });
    await prisma.transportTrackingSession.deleteMany({ where: { trip: { code: TRIP_CODE } } });
    const trip = await trips.findByCode(TRIP_CODE);
    if (trip) {
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: trip.id } });
      await prisma.transportTrip.deleteMany({ where: { code: TRIP_CODE } });
    }
    await prisma.transportVehicle.deleteMany({ where: { registrationPlate: PLATE } });
    await prisma.transportDriver.deleteMany({ where: { phone: DRIVER_PHONE } });
  }

  const fix = (externalEventId: string) => ({
    providerId: PROVIDER,
    externalEventId,
    vehicleId,
    latitude: 20.8449,
    longitude: 106.6881,
    accuracyMetres: 8,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    capturedAt: RECORDED,
    receivedAt: RECORDED,
    clockSkewSeconds: 0,
    businessDate: BUSINESS_DATE,
  });

  /** Than yeu cau tho, di THANG xuong Prisma — de cham duoc vao `CHECK` ma kho khong cho di qua. */
  const rawObservation = (over: Record<string, unknown>) => ({
    clientEventId: 'ittele-tho',
    latitude: 20.8449,
    longitude: 106.6881,
    source: 'TELEMATICS' as const,
    capturedAt: RECORDED,
    receivedAt: RECORDED,
    clockSkewSeconds: 0,
    businessDate: BUSINESS_DATE,
    ...over,
  });

  beforeAll(async () => {
    await cleanup();
    const vehicle = await fleet.createVehicle({ registrationPlate: PLATE, vehicleClass: 'TRUCK' });
    const driver = await fleet.createDriver({
      fullName: 'ITTELE Lai xe',
      phone: DRIVER_PHONE,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const trip = await trips.create({
      code: TRIP_CODE,
      kind: 'OWN_DIRECT',
      businessDate: BUSINESS_DATE,
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
    });
    vehicleId = vehicle.id;
    const session = await tracking.createSession({
      driverId: driver.id,
      tripId: trip.id,
      vehicleId,
      deviceInstallationId: null,
      businessDate: BUSINESS_DATE,
      startedAt: new Date('2026-09-18T01:00:00Z'),
      openedBy: 'ittele',
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('ghi mot ban gan THANG vao xe — khong phien nao, kem mot hang so bien gioi', async () => {
    const observation = await tracking.appendTelematicsObservation(fix('ittele-1'));

    expect(observation.sessionId).toBeNull();
    expect(observation.vehicleId).toBe(vehicleId);
    expect(observation.source).toBe('TELEMATICS');
    await expect(tracking.findTelematicsIngress(PROVIDER, 'ittele-1')).resolves.toMatchObject({
      observationId: observation.id,
      vehicleId,
    });
  });

  it('CUNG `(dau noi, ma su kien)` -> va cham unique, khong phai mot hang thu hai', async () => {
    await tracking.appendTelematicsObservation(fix('ittele-trung'));

    let caught: unknown = null;
    try {
      await tracking.appendTelematicsObservation(fix('ittele-trung'));
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(isUniqueViolationOn(caught, TELEMATICS_INGRESS_EVENT)).toBe(true);
  });

  it('dau noi KHAC duoc phep dung TRUNG mot ma su kien', async () => {
    // Khoa la CAP. Neu chi khoa ma su kien thi dau noi thu hai bi chan boi nhung ma do dau noi thu
    // nhat tinh co dung truoc — mot loi khong ai lan ra duoc.
    await tracking.appendTelematicsObservation({
      ...fix('ittele-chung-ma'),
      providerId: 'ittele-dau-noi-hai',
    });

    await expect(
      tracking.appendTelematicsObservation(fix('ittele-chung-ma')),
    ).resolves.toMatchObject({ source: 'TELEMATICS' });
  });

  it('`TELEMATICS` gan vao mot PHIEN bi TU CHOI o tang luu tru', async () => {
    // Day la hinh dang ma moi bo bai truoc `#297` T4 dung de gia lap mot nguon thu hai: mot ban ghi
    // cua phien DIEN THOAI, dan nhan `TELEMATICS`. Neu bai nay do, mot chiec dien thoai lai co the
    // tu khai minh la phan cung tren xe — va `SOURCE_FALLBACK` lai tro thanh mot cau noi suong.
    await expect(
      prisma.transportLocationObservation.create({
        data: rawObservation({ sessionId, clientEventId: 'ittele-gia-mao' }),
      }),
    ).rejects.toThrow(/TransportLocationObservation_telematics_subject/);
  });

  it('ban gan vao XE ma nguon KHONG phai `TELEMATICS` cung bi TU CHOI', async () => {
    // Chieu con lai cua cung mot rang buoc: cot `vehicleId` khong duoc lang le tro thanh mot duong
    // ghi vi tri thu hai cho moi nguon khac.
    await expect(
      prisma.transportLocationObservation.create({
        data: rawObservation({
          vehicleId,
          clientEventId: 'ittele-gnss-tren-xe',
          source: 'DEVICE_GNSS',
        }),
      }),
    ).rejects.toThrow(/TransportLocationObservation_telematics_subject/);
  });

  it('ban KHONG co chu the nao bi TU CHOI — khong co bang chung mo coi', async () => {
    await expect(
      prisma.transportLocationObservation.create({
        data: rawObservation({ clientEventId: 'ittele-mo-coi' }),
      }),
    ).rejects.toThrow(/TransportLocationObservation_one_subject/);
  });

  it('ban mang CA HAI chu the bi TU CHOI — hai duong doc co the mau thuan nhau', async () => {
    await expect(
      prisma.transportLocationObservation.create({
        data: rawObservation({ sessionId, vehicleId, clientEventId: 'ittele-hai-chu-the' }),
      }),
    ).rejects.toThrow(/TransportLocationObservation_one_subject/);
  });

  it('SUC KHOE VI TRI doc duoc ban tu phan cung — ca hai duong den mot chiec xe', async () => {
    await tracking.appendTelematicsObservation(fix('ittele-suc-khoe'));

    const samples = await tracking.latestObservationPerSourceForVehicle(
      vehicleId,
      new Date('2026-09-18T00:00:00Z'),
    );
    const telematics = samples.filter((sample) => sample.source === 'TELEMATICS');

    // Neu truy van chi hoi qua `session.vehicleId` thi mang nay RONG — va phep cham suc khoe se bao
    // `NOT_CONFIGURED`/`LOST` cho mot chiec xe dang co phan cung bao ve deu dan.
    expect(telematics.length).toBeGreaterThan(0);
    expect(telematics.every((sample) => sample.sessionId === null)).toBe(true);
  });
});
