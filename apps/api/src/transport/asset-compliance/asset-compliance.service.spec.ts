import { describe, expect, it } from 'vitest';
import { AssetComplianceService } from './asset-compliance.service.js';
import {
  AssetComplianceCoreFacts,
  type InTransitVehicleAssignment,
  type VehicleFacts,
} from './asset-compliance.ports.js';
import { InMemoryAssetComplianceRepository } from './in-memory-asset-compliance.repository.js';

/** Cong gia lap — mot doi xe cu the, khong phai mot mock tu dong. */
class StubCore extends AssetComplianceCoreFacts {
  constructor(
    private readonly vehicles: VehicleFacts[] = [
      {
        id: 'veh-1',
        registrationPlate: '29H-11111',
        vehicleClass: 'TRUCK',
        currentOdoKm: 100_000,
        status: 'IDLE',
      },
    ],
    private readonly drivers: string[] = ['drv-1'],
    private readonly inTransit: InTransitVehicleAssignment[] = [],
  ) {
    super();
  }
  async findVehicle(vehicleId: string): Promise<VehicleFacts | null> {
    return this.vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  }
  async listVehicles(): Promise<VehicleFacts[]> {
    return this.vehicles;
  }
  async driverExists(driverId: string): Promise<boolean> {
    return this.drivers.includes(driverId);
  }
  async listInTransitAssignments(): Promise<InTransitVehicleAssignment[]> {
    return this.inTransit;
  }
}

const build = (core = new StubCore()) => {
  const repository = new InMemoryAssetComplianceRepository();
  return { repository, service: new AssetComplianceService(repository, core) };
};

const planInput = {
  vehicleId: 'veh-1',
  name: 'Thay dau may',
  triggerKind: 'ODOMETER' as const,
  intervalKm: 10_000,
  intervalDays: null,
  baselineOdoKm: 100_000,
  baselineDate: '2026-06-01',
  createdBy: 'ke-toan',
};

describe('lich bao duong — cong kiem dau vao', () => {
  it('lich ODOMETER thieu `intervalKm` bi tu choi', async () => {
    const { service } = build();
    await expect(service.schedulePlan({ ...planInput, intervalKm: null })).rejects.toMatchObject({
      reason: 'MAINTENANCE_INTERVAL_MISMATCH',
    });
  });

  it('lich CALENDAR mang ca `intervalKm` bi tu choi', async () => {
    const { service } = build();
    await expect(
      service.schedulePlan({ ...planInput, triggerKind: 'CALENDAR', intervalDays: 90 }),
    ).rejects.toMatchObject({ reason: 'MAINTENANCE_INTERVAL_MISMATCH' });
  });

  it('lich cho mot xe khong ton tai bi tu choi', async () => {
    const { service } = build();
    await expect(
      service.schedulePlan({ ...planInput, vehicleId: 'veh-khong-co' }),
    ).rejects.toMatchObject({ reason: 'MAINTENANCE_VEHICLE_NOT_FOUND' });
  });

  it('sua lich van phai giu hop le sau khi tron patch len ban cu', async () => {
    const { service } = build();
    const plan = await service.schedulePlan(planInput);

    await expect(service.updatePlan(plan.id, { triggerKind: 'CALENDAR' })).rejects.toMatchObject({
      reason: 'MAINTENANCE_INTERVAL_MISMATCH',
    });

    const fixed = await service.updatePlan(plan.id, {
      triggerKind: 'CALENDAR',
      intervalKm: null,
      intervalDays: 90,
    });
    expect(fixed.triggerKind).toBe('CALENDAR');
  });
});

describe('lenh sua — mot lenh dang mo cho moi ke hoach', () => {
  const openInput = {
    vehicleId: 'veh-1',
    planId: null as string | null,
    description: 'Thay dau',
    openedDate: '2026-09-01',
    openedOdoKm: 110_000,
    openedBy: 'ke-toan',
  };

  it('mo lenh thu hai tren CUNG ke hoach bi tu choi', async () => {
    const { service } = build();
    const plan = await service.schedulePlan(planInput);

    await service.openWorkOrder({ ...openInput, planId: plan.id });
    await expect(service.openWorkOrder({ ...openInput, planId: plan.id })).rejects.toMatchObject({
      reason: 'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
    });
  });

  /** Hai hong hoc khac nhau tren cung mot xe la chuyen binh thuong — khong bi rang buoc. */
  it('hai lenh DOT XUAT cung mo duoc tren cung mot xe', async () => {
    const { service } = build();
    await service.openWorkOrder(openInput);
    await expect(
      service.openWorkOrder({ ...openInput, description: 'Thay guong' }),
    ).resolves.toMatchObject({
      status: 'OPEN',
    });
  });

  it('mo lenh cho mot ke hoach khong ton tai bi tu choi', async () => {
    const { service } = build();
    await expect(
      service.openWorkOrder({ ...openInput, planId: 'plan-khong-co' }),
    ).rejects.toMatchObject({ reason: 'MAINTENANCE_PLAN_NOT_FOUND' });
  });

  it('dong lenh voi odo NHO HON luc mo bi tu choi', async () => {
    const { service } = build();
    const order = await service.openWorkOrder(openInput);

    await expect(
      service.completeWorkOrder(order.id, {
        completedDate: '2026-09-02',
        completedOdoKm: 109_000,
        completedBy: 'ke-toan',
        completedAt: new Date('2026-09-02T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ reason: 'MAINTENANCE_ODO_REGRESSION' });
  });

  it('dong mot lenh da dong bi tu choi bang mot ma RIENG', async () => {
    const { service } = build();
    const order = await service.openWorkOrder(openInput);
    const close = {
      completedDate: '2026-09-02',
      completedOdoKm: 110_100,
      completedBy: 'ke-toan',
      completedAt: new Date('2026-09-02T00:00:00.000Z'),
    };

    await service.completeWorkOrder(order.id, close);
    await expect(service.completeWorkOrder(order.id, close)).rejects.toMatchObject({
      reason: 'MAINTENANCE_WORK_ORDER_NOT_OPEN',
    });
  });

  it('dong lenh xong thi ke hoach mo duoc lenh moi', async () => {
    const { service } = build();
    const plan = await service.schedulePlan(planInput);
    const order = await service.openWorkOrder({ ...openInput, planId: plan.id });

    await service.completeWorkOrder(order.id, {
      completedDate: '2026-09-02',
      completedOdoKm: 110_100,
      completedBy: 'ke-toan',
      completedAt: new Date('2026-09-02T00:00:00.000Z'),
    });

    await expect(
      service.openWorkOrder({ ...openInput, planId: plan.id, openedOdoKm: 120_000 }),
    ).resolves.toMatchObject({ status: 'OPEN' });
  });
});

describe('giay to — chu the phai co that va dung hinh dang', () => {
  const docInput = {
    subjectKind: 'VEHICLE' as const,
    subjectId: 'veh-1',
    documentType: 'VEHICLE_INSPECTION' as const,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    recordedBy: 'ke-toan',
  };

  it('giay to CONG TY khong duoc gan vao mot xe', async () => {
    const { service } = build();
    await expect(
      service.registerDocument({
        ...docInput,
        subjectKind: 'COMPANY',
        documentType: 'COMPANY_TRANSPORT_LICENSE',
      }),
    ).rejects.toMatchObject({ reason: 'COMPLIANCE_SUBJECT_SHAPE_INVALID' });
  });

  it('giay to cua XE bat buoc phai chi ro xe nao', async () => {
    const { service } = build();
    await expect(service.registerDocument({ ...docInput, subjectId: null })).rejects.toMatchObject({
      reason: 'COMPLIANCE_SUBJECT_SHAPE_INVALID',
    });
  });

  /**
   * `subjectId` la khoa DA DICH nen Postgres khong co khoa ngoai nao giu ho — cong nay la cho DUY
   * NHAT su ton tai duoc kiem.
   */
  it('chu the khong ton tai bi tu choi (khong co khoa ngoai da dich)', async () => {
    const { service } = build();
    await expect(
      service.registerDocument({ ...docInput, subjectId: 'veh-ma' }),
    ).rejects.toMatchObject({ reason: 'COMPLIANCE_SUBJECT_NOT_FOUND' });

    await expect(
      service.registerDocument({
        ...docInput,
        subjectKind: 'DRIVER',
        subjectId: 'drv-ma',
        documentType: 'DRIVER_LICENCE',
      }),
    ).rejects.toMatchObject({ reason: 'COMPLIANCE_SUBJECT_NOT_FOUND' });
  });

  it('ky hieu luc dao nguoc bi tu choi', async () => {
    const { service } = build();
    await expect(
      service.registerDocument({ ...docInput, validFrom: '2026-12-31', validTo: '2026-01-01' }),
    ).rejects.toMatchObject({ reason: 'COMPLIANCE_VALIDITY_RANGE_INVALID' });
  });

  it('giay to CONG TY khong co chu the con la hop le', async () => {
    const { service } = build();
    await expect(
      service.registerDocument({
        ...docInput,
        subjectKind: 'COMPANY',
        subjectId: null,
        documentType: 'COMPANY_TRANSPORT_LICENSE',
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });
});
