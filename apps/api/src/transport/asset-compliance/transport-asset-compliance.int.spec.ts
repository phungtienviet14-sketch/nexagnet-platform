import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { AssetComplianceCoreFactsAdapter } from './asset-compliance.ports.js';
import { AssetComplianceService } from './asset-compliance.service.js';
import { PrismaAssetComplianceRepository } from './prisma-asset-compliance.repository.js';

/**
 * T6/`TX-06` — BANG CHUNG TREN POSTGRES THAT (Issue #88).
 *
 * VI SAO PHAI LA POSTGRES THAT: gan het nhung gi capability nay hua song o RANH GIOI voi CSDL —
 * unique MOT PHAN "mot lenh dang mo cho moi ke hoach", `CHECK` hinh dang chu the giay to, va
 * `CHECK` ngay ISO co that. Kho in-memory theo dinh nghia khong co ranh gioi do: no se XANH ca ba
 * du khong cai nao ton tai.
 *
 * TIEN TO `IT-T6A` — khong trung va khong long nhau voi tien to cua bat ky tep IT nao khac; don dep
 * dung `startsWith`, nen mot tien to long nhau se lam mot tep xoa mat du lieu cua tep kia.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Bao duong + giay to + trang thai hieu luc tren Postgres THAT — T6',
  () => {
    const prisma = new PrismaService();
    const repo = new PrismaAssetComplianceRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const core = new AssetComplianceCoreFactsAdapter(fleet, trips);
    const service = new AssetComplianceService(repo, core);

    const PREFIX = 'IT-T6A';
    let vehicleId = '';
    let driverId = '';

    beforeAll(async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await db.transportMaintenanceWorkOrder.deleteMany({
        where: { description: { startsWith: PREFIX } },
      });
      await db.transportMaintenancePlan.deleteMany({ where: { name: { startsWith: PREFIX } } });
      await db.transportComplianceDocument.deleteMany({
        where: { recordedBy: { startsWith: PREFIX } },
      });
      await db.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PREFIX } },
      });
      // `runPayroll` cua tep IT ben canh chay cho MOI lai xe dang hoat dong, ke ca lai xe cua tep
      // nay — nen phieu luong tro toi no phai di truoc, neu khong khoa ngoai chan lai lan xoa.
      const mine = await db.transportDriver.findMany({
        where: { fullName: { startsWith: PREFIX } },
        select: { id: true },
      });
      const mineIds = mine.map((driver: { id: string }) => driver.id);
      await db.transportPayslip.deleteMany({
        where: { driverId: { in: mineIds }, kind: { not: 'ORIGINAL' } },
      });
      await db.transportPayslip.deleteMany({ where: { driverId: { in: mineIds } } });
      await db.transportDriver.deleteMany({ where: { fullName: { startsWith: PREFIX } } });

      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PREFIX}-29H-001`,
        vehicleClass: 'TRUCK',
        currentOdoKm: 100_000,
      });
      vehicleId = vehicle.id;
      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe`,
        phone: '0900000001',
        licenceClass: 'FC',
        licenceExpiry: '2027-01-01',
      });
      driverId = driver.id;
    });

    it('P1: lich bao duong va lenh sua ghi xuong Postgres va doc lai duoc', async () => {
      const plan = await service.schedulePlan({
        vehicleId,
        name: `${PREFIX} Thay dau may`,
        triggerKind: 'ODOMETER_OR_CALENDAR',
        intervalKm: 10_000,
        intervalDays: 180,
        baselineOdoKm: 100_000,
        baselineDate: '2026-06-01',
        createdBy: `${PREFIX}-ke-toan`,
      });

      const order = await service.openWorkOrder({
        vehicleId,
        planId: plan.id,
        description: `${PREFIX} Thay dau lan 1`,
        openedDate: '2026-09-01',
        openedOdoKm: 110_500,
        openedBy: `${PREFIX}-ke-toan`,
      });

      expect((await repo.findPlan(plan.id))?.intervalDays).toBe(180);
      expect((await repo.findWorkOrder(order.id))?.status).toBe('OPEN');
    });
    /**
     * Unique MOT PHAN la thu duy nhat dung khi CO HAI NGUOI GHI CUNG LUC.
     *
     * Kiem o service (doc roi ghi) dung voi mot nguoi. Bai nay ghi hai lenh song song bang
     * `Promise.allSettled` de hai lenh `INSERT` that su tranh nhau, roi khang dinh DUNG MOT thanh
     * cong — do la khac biet giua mot bat bien va mot y dinh tot.
     */
    it('P2: hai lenh sua mo SONG SONG tren cung ke hoach -> dung mot thanh cong', async () => {
      const plan = await service.schedulePlan({
        vehicleId,
        name: `${PREFIX} Thay loc gio`,
        triggerKind: 'ODOMETER',
        intervalKm: 20_000,
        intervalDays: null,
        baselineOdoKm: 100_000,
        baselineDate: '2026-06-01',
        createdBy: `${PREFIX}-ke-toan`,
      });

      const open = () =>
        service.openWorkOrder({
          vehicleId,
          planId: plan.id,
          description: `${PREFIX} Tranh nhau`,
          openedDate: '2026-09-02',
          openedOdoKm: 120_000,
          openedBy: `${PREFIX}-ke-toan`,
        });

      const results = await Promise.allSettled([open(), open()]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        reason: 'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
      });
    });

    it('P3: `CHECK` chan mot ngay khong co that ngay o tang luu tru', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportComplianceDocument.create({
          data: {
            subjectKind: 'VEHICLE',
            subjectId: vehicleId,
            documentType: 'VEHICLE_INSPECTION',
            validFrom: '2026-02-30',
            validTo: '2027-01-01',
            recordedBy: `${PREFIX}-ke-toan`,
          },
        }),
      ).rejects.toBeTruthy();
    });

    it('P4: `CHECK` chan giay to CONG TY bi gan vao mot xe', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportComplianceDocument.create({
          data: {
            subjectKind: 'COMPANY',
            subjectId: vehicleId,
            documentType: 'COMPANY_TRANSPORT_LICENSE',
            validFrom: '2026-01-01',
            validTo: '2027-01-01',
            recordedBy: `${PREFIX}-ke-toan`,
          },
        }),
      ).rejects.toBeTruthy();
    });

    /**
     * B3 — MOT LENH SUA KHONG NAM DUOC TRONG KE HOACH CUA MOT CHIEC XE KHAC.
     *
     * Schema noi `TransportMaintenanceWorkOrder` toi xe va toi ke hoach bang HAI khoa ngoai DOC
     * LAP, nen ca hai deu tro toi hang co that ma cap doi van sai. Hau qua o
     * `maintenance-schedule.ts`: han bao duong ke tiep cua mot ke hoach duoc tinh tu cac lenh DA
     * DONG cua chinh no, nen mot lenh cua xe khac keo moc chu ky di theo so odo cua chiec xe do.
     *
     * Cong o service chan duoc nguoi dung. Trigger la thu duy nhat chan duoc mot lan ghi THANG.
     */
    it('B3 (P6): lenh sua tro toi ke hoach cua XE KHAC bi trigger chan', async () => {
      const other = await fleet.createVehicle({
        registrationPlate: `${PREFIX}-29H-002`,
        vehicleClass: 'TRUCK',
        currentOdoKm: 80_000,
      });
      const plan = await service.schedulePlan({
        vehicleId,
        name: `${PREFIX} Thay lop`,
        triggerKind: 'ODOMETER',
        intervalKm: 40_000,
        intervalDays: null,
        baselineOdoKm: 100_000,
        baselineDate: '2026-06-01',
        createdBy: `${PREFIX}-ke-toan`,
      });

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportMaintenanceWorkOrder.create({
          data: {
            vehicleId: other.id,
            planId: plan.id,
            description: `${PREFIX} Lech xe`,
            openedDate: '2026-09-03',
            openedOdoKm: 80_500,
            openedBy: `${PREFIX}-ke-toan`,
          },
        }),
      ).rejects.toThrow(/TransportMaintenanceWorkOrder_plan_same_vehicle/);

      // Va khong go duoc rang buoc bang cach doi xe cua chinh ke hoach.
      await expect(
        db.transportMaintenancePlan.update({
          where: { id: plan.id },
          data: { vehicleId: other.id },
        }),
      ).rejects.toThrow(/TransportMaintenancePlan_vehicle_immutable/);

      expect((await repo.findPlan(plan.id))?.vehicleId).toBe(vehicleId);
    });

    /**
     * ACCEPTANCE 13 — trang thai song sot qua mot KET NOI MOI.
     *
     * `PrismaService` moi = client moi, pool moi. Neu mot phan trang thai con nam trong bo nho cua
     * tien trinh (mot `Map` quen doi thanh bang), bai nay do. Bai `P6` di xa hon mot buoc: doc lai
     * tu mot TIEN TRINH khac han.
     */
    it('ACCEPTANCE 13 (P5): giay to va lenh sua doc lai duoc bang mot client HOAN TOAN MOI', async () => {
      const document = await service.registerDocument({
        subjectKind: 'DRIVER',
        subjectId: driverId,
        documentType: 'DRIVER_LICENCE',
        validFrom: '2026-01-01',
        validTo: '2026-09-20',
        recordedBy: `${PREFIX}-ke-toan`,
      });

      const freshPrisma = new PrismaService();
      const freshRepo = new PrismaAssetComplianceRepository(freshPrisma);
      try {
        const reread = await freshRepo.findDocument(document.id);
        expect(reread?.validTo).toBe('2026-09-20');
        expect(reread?.subjectId).toBe(driverId);

        const plans = await freshRepo.listPlans(vehicleId);
        expect(plans.length).toBeGreaterThanOrEqual(2);
      } finally {
        await freshPrisma.$disconnect();
      }
    });
  },
);
