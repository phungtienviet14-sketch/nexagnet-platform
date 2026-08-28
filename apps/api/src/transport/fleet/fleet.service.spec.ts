import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  InMemoryAuditLogRepository,
} from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryFleetRepository } from './fleet.repository.js';
import { FleetService } from './fleet.service.js';

const ACTOR = 'nguoi-van-hanh';

describe('FleetService', () => {
  let repository: InMemoryFleetRepository;
  let auditRepository: AuditLogRepository;
  let service: FleetService;

  beforeEach(() => {
    repository = new InMemoryFleetRepository();
    auditRepository = new InMemoryAuditLogRepository();
    service = new FleetService(repository, new AuditLogService(auditRepository));
  });

  describe('Xe', () => {
    it('dang ky xe voi bien so, loai, tai trong va odo', async () => {
      const vehicle = await service.registerVehicle(
        {
          registrationPlate: '29H-123.45',
          vehicleClass: 'Xe tai thung 5 tan',
          allowedPayloadKg: 5000,
          currentOdoKm: 128_400,
        },
        ACTOR,
      );

      expect(vehicle.registrationPlate).toBe('29H-123.45');
      expect(vehicle.allowedPayloadKg).toBe(5000);
      expect(vehicle.currentOdoKm).toBe(128_400);
      expect(vehicle.status).toBe('IDLE');
    });

    it('KHONG mang truong "lai xe hien tai" — quan he do thuoc ve lich su phan cong', async () => {
      const vehicle = await service.registerVehicle(
        { registrationPlate: '29H-000.01', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      expect(Object.keys(vehicle)).not.toContain('driverId');
      expect(Object.keys(vehicle)).not.toContain('currentDriverId');
    });

    it('bien so trung bi TU CHOI — mot bien so la mot chiec xe', async () => {
      await service.registerVehicle(
        { registrationPlate: '29H-123.45', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      await expect(
        service.registerVehicle({ registrationPlate: '29H-123.45', vehicleClass: 'Xe tai' }, ACTOR),
      ).rejects.toThrow(TransportDomainError);
    });

    it('ghi audit khi tao va khi sua', async () => {
      const vehicle = await service.registerVehicle(
        { registrationPlate: '29H-777.77', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      await service.updateVehicle(vehicle.id, { status: 'UNDER_MAINTENANCE' }, ACTOR);

      const entries = await auditRepository.list({});
      const actions = entries.map((entry) => entry.action);
      expect(actions).toContain('transport.vehicle.create');
      expect(actions).toContain('transport.vehicle.update');
      expect(entries.every((entry) => entry.actor === ACTOR)).toBe(true);
    });

    it('sua mot xe khong ton tai thi nem, khong lang le tao moi', async () => {
      await expect(service.updateVehicle('khong-co-that', { status: 'IDLE' }, ACTOR)).rejects.toThrow(
        TransportDomainError,
      );
    });
  });

  describe('Lai xe', () => {
    it('dang ky lai xe voi hang va han GPLX', async () => {
      const driver = await service.registerDriver(
        {
          fullName: 'Lai Xe Demo Mot',
          phone: '0900000001',
          licenceClass: 'FC',
          licenceExpiry: '2028-05-30',
        },
        ACTOR,
      );
      expect(driver.licenceClass).toBe('FC');
      expect(driver.licenceExpiry).toBe('2028-05-30');
      expect(driver.status).toBe('ACTIVE');
      expect(driver.authUserId).toBeNull();
    });

    it('han GPLX sai dang bi TU CHOI ngay tai bien gioi', async () => {
      await expect(
        service.registerDriver(
          {
            fullName: 'Lai Xe Demo Hai',
            phone: '0900000002',
            licenceClass: 'C',
            licenceExpiry: '30/05/2028',
          },
          ACTOR,
        ),
      ).rejects.toThrow(TransportDomainError);
    });

    it('KHONG luu mat khau hay bat ky bi mat dang nhap nao', async () => {
      const driver = await service.registerDriver(
        {
          fullName: 'Lai Xe Demo Ba',
          phone: '0900000003',
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        },
        ACTOR,
      );
      const keys = Object.keys(driver).map((key) => key.toLowerCase());
      for (const forbidden of ['password', 'passwordhash', 'secret', 'token', 'credential']) {
        expect(
          keys.some((key) => key.includes(forbidden)),
          forbidden,
        ).toBe(false);
      }
    });
  });

  // ASSIGNMENT-001
  describe('ASSIGNMENT-001: gan lai xe phu trach xe co LICH SU', () => {
    it('lan gan dau tao mot ban dang hieu luc', async () => {
      const vehicle = await service.registerVehicle(
        { registrationPlate: '29H-111.11', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      const driver = await service.registerDriver(
        {
          fullName: 'Lai Xe A',
          phone: '0900000011',
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        },
        ACTOR,
      );

      const assignment = await service.assignDriverToVehicle(vehicle.id, driver.id, ACTOR);
      expect(assignment.effectiveTo).toBeNull();

      const history = await service.vehicleAssignmentHistory(vehicle.id);
      expect(history).toHaveLength(1);
    });

    it('doi lai xe phu trach GIU ban cu va dong lai no, khong ghi de', async () => {
      const vehicle = await service.registerVehicle(
        { registrationPlate: '29H-222.22', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      const first = await service.registerDriver(
        {
          fullName: 'Lai Xe A',
          phone: '0900000021',
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        },
        ACTOR,
      );
      const second = await service.registerDriver(
        {
          fullName: 'Lai Xe B',
          phone: '0900000022',
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        },
        ACTOR,
      );

      await service.assignDriverToVehicle(vehicle.id, first.id, ACTOR);
      await service.assignDriverToVehicle(vehicle.id, second.id, ACTOR);

      const history = await service.vehicleAssignmentHistory(vehicle.id);
      expect(history).toHaveLength(2);

      const closed = history.filter((entry) => entry.effectiveTo !== null);
      const active = history.filter((entry) => entry.effectiveTo === null);
      expect(closed).toHaveLength(1);
      expect(closed[0]?.driverId).toBe(first.id);
      expect(active).toHaveLength(1);
      expect(active[0]?.driverId).toBe(second.id);
    });

    it('gan cho xe hoac lai xe khong ton tai thi nem', async () => {
      const vehicle = await service.registerVehicle(
        { registrationPlate: '29H-333.33', vehicleClass: 'Xe tai' },
        ACTOR,
      );
      await expect(service.assignDriverToVehicle(vehicle.id, 'khong-co-that', ACTOR)).rejects.toThrow(
        TransportDomainError,
      );
      await expect(service.assignDriverToVehicle('khong-co-that', vehicle.id, ACTOR)).rejects.toThrow(
        TransportDomainError,
      );
    });
  });

  // PARTNER-CORE-001
  describe('PARTNER-CORE-001: mot doi tac mang NHIEU vai', () => {
    it('tao duoc doi tac vua cho thue xe vua mang don ve', async () => {
      const partner = await service.createPartner(
        { name: 'Nha Xe Demo', roles: ['CARRIER', 'ORDER_REFERRER'] },
        ACTOR,
      );
      expect([...partner.roles].sort()).toEqual(['CARRIER', 'ORDER_REFERRER']);
    });

    it('vai la mot TAP — khai trung khong nhan doi', async () => {
      const partner = await service.createPartner(
        { name: 'Nha Xe Trung Vai', roles: ['CARRIER', 'CARRIER'] },
        ACTOR,
      );
      expect(partner.roles).toEqual(['CARRIER']);
    });

    it('KHONG co truong partnerType mot gia tri — day chinh la mo hinh XOR bi cam', async () => {
      const partner = await service.createPartner(
        { name: 'Nha Xe Demo 2', roles: ['CARRIER'] },
        ACTOR,
      );
      expect(Object.keys(partner)).not.toContain('partnerType');
      expect(Object.keys(partner)).not.toContain('type');
      expect(Array.isArray(partner.roles)).toBe(true);
    });

    it('them vai cho doi tac dang co MA KHONG mat vai cu', async () => {
      const partner = await service.createPartner(
        { name: 'Nha Xe Demo 3', roles: ['CARRIER'] },
        ACTOR,
      );
      const updated = await service.updatePartner(
        partner.id,
        { roles: ['CARRIER', 'ORDER_REFERRER'] },
        ACTOR,
      );
      expect([...updated.roles].sort()).toEqual(['CARRIER', 'ORDER_REFERRER']);
    });

    it('doi tac khong vai nao bi TU CHOI — khong vai thi khong dung duoc vao viec gi', async () => {
      await expect(service.createPartner({ name: 'Rong Vai', roles: [] }, ACTOR)).rejects.toThrow(
        TransportDomainError,
      );
    });
  });

  describe('Khach hang van tai', () => {
    it('la mot danh muc RIENG, khong phai dai ly cua mien ban hang', async () => {
      const customer = await service.createCustomer(
        { name: 'Cong Ty Demo', phone: '02400000000', taxCode: '0100000000' },
        ACTOR,
      );
      expect(customer.name).toBe('Cong Ty Demo');
      expect(customer.taxCode).toBe('0100000000');
      const keys = Object.keys(customer);
      for (const salesField of ['tier', 'policyType', 'priceList', 'dealerId']) {
        expect(keys, salesField).not.toContain(salesField);
      }
    });

    it('sua ten KHONG lam mat so dien thoai da nhap', async () => {
      const customer = await service.createCustomer(
        { name: 'Cong Ty Demo', phone: '02400000000' },
        ACTOR,
      );
      const updated = await service.updateCustomer(customer.id, { name: 'Cong Ty Demo 2' }, ACTOR);
      expect(updated.phone).toBe('02400000000');
    });
  });
});
