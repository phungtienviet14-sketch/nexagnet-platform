import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaFleetRepository } from './fleet/prisma-fleet.repository.js';
import { PrismaTripRepository } from './trips/prisma-trip.repository.js';

/**
 * TANG PRISMA CUA VAN TAI tren Postgres THAT.
 *
 * Bo test in-memory chung minh QUY TAC NGHIEP VU; bo nay chung minh cai ma quy tac do dua vao:
 * migration ap duoc, cot tien la so nguyen, ngay nghiep vu khong bi mui gio dung vao, va hai lan
 * ghi cua mot lan doi phan cong that su nam trong MOT giao dich.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi bo qua thay vi do — nhung do cung
 * co nghia la "xanh o may" KHONG phu nhung bai nay. Chung chay o job `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Transport repositories (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const fleet = new PrismaFleetRepository(prisma);
  const trips = new PrismaTripRepository(prisma);

  const PLATE = 'IT-TRANSPORT-0001';
  const TRIP_CODE = 'IT-TRANSPORT-CH-1';
  const PARTNER_NAME = 'IT Transport Partner';
  const DRIVER_PHONE_PREFIX = '0900IT';

  async function cleanup(): Promise<void> {
    const trip = await trips.findByCode(TRIP_CODE);
    if (trip) {
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: trip.id } });
      await prisma.transportTrip.deleteMany({ where: { code: TRIP_CODE } });
    }
    const vehicle = await fleet.findVehicleByPlate(PLATE);
    if (vehicle) {
      await prisma.transportVehicleAssignment.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.transportVehicle.deleteMany({ where: { registrationPlate: PLATE } });
    }
    await prisma.transportDriver.deleteMany({
      where: { phone: { startsWith: DRIVER_PHONE_PREFIX } },
    });
    await prisma.transportPartner.deleteMany({ where: { name: PARTNER_NAME } });
  }

  beforeAll(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('mot chuyen di tron vong doi, va TIEN van la so nguyen dong sau khi qua DB', async () => {
    const trip = await trips.create({
      code: TRIP_CODE,
      kind: 'OWN_DIRECT',
      businessDate: '2026-08-01',
      originLabel: 'Ha Noi',
      destinationLabel: 'Thai Nguyen',
      freightAmount: 4_500_000,
    });

    expect(trip.status).toBe('PLANNED');
    expect(trip.freightAmount).toBe(4_500_000);
    expect(Number.isInteger(trip.freightAmount)).toBe(true);
    expect(trip.currencyCode).toBe('VND');

    // NGAY NGHIEP VU di qua DB roi ve VAN nguyen van chuoi cu — khong co buoc doi sang timestamp
    // nao de mui gio kip xen vao (`INV-25`). Day la ly do cot nay la `VarChar(10)`, khong phai
    // `timestamp`.
    expect(trip.businessDate).toBe('2026-08-01');

    const running = await trips.setStatus(trip.id, 'IN_TRANSIT', new Date());
    expect(running?.status).toBe('IN_TRANSIT');

    const cancelled = await trips.cancel(trip.id, { reason: 'IT', at: new Date() });
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.cancellationReason).toBe('IT');

    // HUY KHONG PHAI XOA: ban ghi van doc duoc sau khi huy.
    expect((await trips.find(trip.id))?.id).toBe(trip.id);
  });

  it('doi phan cong giu LICH SU: ban cu dong lai, dung MOT ban dang hieu luc', async () => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: PLATE,
      vehicleClass: 'Xe tai',
    });
    const driverA = await fleet.createDriver({
      fullName: 'IT Driver A',
      phone: `${DRIVER_PHONE_PREFIX}A`,
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
    });
    const driverB = await fleet.createDriver({
      fullName: 'IT Driver B',
      phone: `${DRIVER_PHONE_PREFIX}B`,
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
    });

    const trip = await trips.findByCode(TRIP_CODE);
    expect(trip).not.toBeNull();
    const tripId = trip!.id;

    const first = await trips.assign(tripId, {
      vehicleId: vehicle.id,
      driverId: driverA.id,
      assignedBy: 'it',
      at: new Date('2026-08-01T01:00:00.000Z'),
    });
    expect(first.previous).toBeNull();

    const second = await trips.assign(tripId, {
      vehicleId: vehicle.id,
      driverId: driverB.id,
      assignedBy: 'it',
      at: new Date('2026-08-01T05:00:00.000Z'),
    });
    expect(second.previous?.driverId).toBe(driverA.id);

    const history = await trips.listAssignments(tripId);
    expect(history).toHaveLength(2);
    expect(history.filter((entry) => entry.effectiveTo === null)).toHaveLength(1);
    expect((await trips.activeAssignment(tripId))?.driverId).toBe(driverB.id);

    // Lai xe A KHONG con hieu luc nhung VAN doc duoc chuyen minh da lai — do la lich su cua chinh
    // ho, va T3 se can no de quy khoan chi ve dung so quy.
    expect(await trips.listTripIdsEverAssignedTo(driverA.id)).toContain(tripId);
    expect(await trips.listTripIdsEverAssignedTo(driverB.id)).toContain(tripId);
  });

  it('gan lai xe phu trach XE cung dong ban cu lai, khong chong lap', async () => {
    const vehicle = await fleet.findVehicleByPlate(PLATE);
    expect(vehicle).not.toBeNull();
    const drivers = await prisma.transportDriver.findMany({
      where: { phone: { startsWith: DRIVER_PHONE_PREFIX } },
      orderBy: { fullName: 'asc' },
    });
    expect(drivers.length).toBeGreaterThanOrEqual(2);

    await fleet.assignDriverToVehicle(
      vehicle!.id,
      drivers[0]!.id,
      new Date('2026-08-01T01:00:00.000Z'),
    );
    await fleet.assignDriverToVehicle(
      vehicle!.id,
      drivers[1]!.id,
      new Date('2026-08-02T01:00:00.000Z'),
    );

    const history = await fleet.listVehicleDriverAssignments(vehicle!.id);
    expect(history).toHaveLength(2);
    expect(history.filter((entry) => entry.effectiveTo === null)).toHaveLength(1);
  });

  it('mot doi tac giu duoc HAI VAI, va rut bot vai thi vai cu bien mat that', async () => {
    const partner = await fleet.createPartner({
      name: PARTNER_NAME,
      roles: ['CARRIER', 'ORDER_REFERRER'],
    });
    expect([...partner.roles].sort()).toEqual(['CARRIER', 'ORDER_REFERRER']);

    const narrowed = await fleet.updatePartner(partner.id, { roles: ['CARRIER'] });
    expect(narrowed?.roles).toEqual(['CARRIER']);

    const widened = await fleet.updatePartner(partner.id, {
      roles: ['CARRIER', 'ORDER_REFERRER'],
    });
    expect([...(widened?.roles ?? [])].sort()).toEqual(['CARRIER', 'ORDER_REFERRER']);
  });

  it('bien so trung bi DB tu choi — bat bien nay co ca o tang kho, khong chi o service', async () => {
    await expect(
      fleet.createVehicle({ registrationPlate: PLATE, vehicleClass: 'Xe tai' }),
    ).rejects.toThrow();
  });
});
