import { loadTenantConfig, resetTenantCache } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addBusinessDays, businessDateDifferenceInDays } from '../business-date.js';
import { type DemoMonthDataset, loadDemoMonthDataset } from './demo-dataset.js';
import { type DemoPlan, buildDemoPlan } from './demo-plan.js';

/**
 * BO DU LIEU DUOC GIAO — khong phai mot bo du lieu gia dung trong bai test.
 *
 * Bai nay nap CHINH goi khach `transport-preview` tren dia. Mot fixture rieng se kiem duoc thuat
 * toan nhung khong kiem duoc thu ma #90 that su doi: rang BO DU LIEU DUOC GIAO co du khoi luong,
 * du ba loai chuyen, va du ca bon ket cuc doi soat. Mot ban demo thieu mot trong so do van lam bo
 * test xanh neu bo test tu dung du lieu cua no.
 */

const ANCHOR = '2026-09-05';

let dataset: DemoMonthDataset;
let plan: DemoPlan;

const build = (anchor: string): DemoPlan => {
  const fuel = loadTenantConfig().policies.transportFuel;
  return buildDemoPlan(dataset, {
    anchor,
    consumptionNorms: fuel?.consumption?.normsByVehicleClass ?? {},
    consumptionTolerancePercent: fuel?.consumption?.tolerancePercent ?? 0,
  });
};

beforeAll(() => {
  process.env.TENANT = 'transport-preview';
  delete process.env.TENANT_DIR;
  resetTenantCache();

  dataset = loadDemoMonthDataset();
  plan = build(ANCHOR);
});

afterAll(() => {
  delete process.env.TENANT;
  resetTenantCache();
});

describe('khoi luong ma #90 doi hoi', () => {
  it('doi xe, nhan su va ban hang du day', () => {
    expect(plan.vehicles.length).toBe(10);
    expect(plan.drivers.length).toBeGreaterThanOrEqual(10);
    expect(plan.drivers.length).toBeLessThanOrEqual(12);
    expect(plan.customers.length).toBeGreaterThanOrEqual(4);
    expect(plan.customers.length).toBeLessThanOrEqual(6);
    expect(plan.suppliers.length).toBe(3);
    expect(plan.partners.length).toBeGreaterThanOrEqual(2);
    expect(plan.partners.length).toBeLessThanOrEqual(4);
    expect(dataset.routes.length).toBeGreaterThanOrEqual(8);
    expect(dataset.routes.length).toBeLessThanOrEqual(12);
  });

  it('30-60 chuyen, va DU CA BA loai', () => {
    expect(plan.trips.length).toBeGreaterThanOrEqual(30);
    expect(plan.trips.length).toBeLessThanOrEqual(60);

    const kinds = new Set(plan.trips.map((trip) => trip.kind));
    expect([...kinds].sort()).toEqual([
      'EXTERNAL_CARRIER',
      'OWN_DIRECT',
      'PARTNER_REFERRED_INTERNAL_RUN',
    ]);
  });

  /**
   * VT-054 — it nhat mot doi tac mang HAI vai.
   *
   * Neu moi doi tac chi mot vai, man hinh doi tac trong y het mot mo hinh XOR — tuc ban demo
   * trung bay dung cai mo hinh ma VT-054 da co y tranh.
   */
  it('co doi tac mang ca hai vai', () => {
    expect(plan.partners.some((partner) => partner.roles.length === 2)).toBe(true);
  });

  it('moi ma kich ban cua #90 deu co mot chuyen mang no', () => {
    const seeded = new Set(
      plan.trips.map((trip) => trip.scenarioId).filter((id): id is string => id !== null),
    );
    for (const id of [
      'DEMO-TRIP-DIRECT',
      'DEMO-DRIVER-FUND',
      'DEMO-FUEL-MATCH',
      'DEMO-FUEL-MISMATCH',
      'DEMO-OUTSOURCED',
      'DEMO-PARTNER-REFERRED',
      'DEMO-CREDIT-WARNING',
      'DEMO-COMPLIANCE',
      'DEMO-PAYROLL',
    ]) {
      expect(seeded, id).toContain(id);
    }
  });
});

describe('tat dinh', () => {
  it('cung mot moc ngay cho ra ke hoach GIONG HET, tung dong', () => {
    expect(build(ANCHOR)).toEqual(plan);
  });

  /**
   * MOC DOI THI MOI NGAY DOI DEU, khong ngay nao dung yen.
   *
   * Do la khac biet giua "tat dinh" va "dong cung": bo du lieu lap lai duoc, nhung no khong het
   * han vao dau thang sau.
   */
  it('doi moc 40 ngay thi MOI ngay nghiep vu dich dung 40 ngay', () => {
    const shifted = build(addBusinessDays(ANCHOR, 40));

    expect(shifted.trips.length).toBe(plan.trips.length);
    shifted.trips.forEach((trip, index) => {
      const original = plan.trips[index];
      expect(trip.code).toBe(original?.code);
      expect(
        businessDateDifferenceInDays(original?.businessDate as string, trip.businessDate),
      ).toBe(40);
    });

    shifted.complianceDocuments.forEach((doc, index) => {
      const original = plan.complianceDocuments[index];
      expect(businessDateDifferenceInDays(original?.validTo as string, doc.validTo)).toBe(40);
    });
  });

  it('khong mot ma chuyen nao bi trung', () => {
    const codes = plan.trips.map((trip) => trip.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('dong ho odo', () => {
  it('odo cua tung xe tang dan theo ngay, khong bao gio lui', () => {
    for (const vehicle of plan.vehicles) {
      const readings = plan.trips
        .filter((trip) => trip.vehicleRef === vehicle.ref)
        .flatMap((trip) => trip.fuelEntries.map((entry) => entry.odometerKm));
      const sorted = [...readings].sort((left, right) => left - right);
      expect(readings, vehicle.ref).toEqual(sorted);
    }
  });

  /**
   * KHONG LAN DO DAU NAO VUOT QUA ODO CUOI KY cua chinh xe do.
   *
   * Day la phep kiem lam ca chuoi odo co nghia: dong ho duoc dat lui ve dau ky roi cong don theo
   * tung chuyen, nen mot lan do vuot qua so cuoi ky nghia la quang duong cong don da lech.
   */
  it('khong lan do dau nao vuot qua odo cuoi ky cua xe', () => {
    for (const vehicle of plan.vehicles) {
      const fills = plan.trips
        .filter((trip) => trip.vehicleRef === vehicle.ref)
        .flatMap((trip) => trip.fuelEntries);
      for (const fill of fills) {
        expect(fill.odometerKm, `${vehicle.ref}/${fill.key}`).toBeLessThanOrEqual(
          vehicle.currentOdoKm,
        );
      }
    }
  });

  it('lan do dau DAU TIEN cua mot xe khong tinh duoc tieu hao, va noi ro ly do', () => {
    for (const vehicle of plan.vehicles) {
      const first = plan.trips
        .filter((trip) => trip.vehicleRef === vehicle.ref)
        .flatMap((trip) => trip.fuelEntries)[0];
      if (first === undefined) continue;
      expect(first.previousOdometerKm, vehicle.ref).toBeNull();
      expect(first.consumptionUnits, vehicle.ref).toBeNull();
      expect(first.reviewReasons, vehicle.ref).toContain('NO_PREVIOUS_ODOMETER');
    }
  });
});

describe('bon ket cuc doi soat deu co mat trong du lieu', () => {
  const tripOf = (scenarioId: string) => plan.trips.find((trip) => trip.scenarioId === scenarioId);

  it('MATCH — bang ke ghi dung so tien cua phieu', () => {
    const entry = tripOf('DEMO-FUEL-MATCH')?.fuelEntries[0];
    expect(entry).toBeDefined();
    expect(entry?.statementAmount).toBe(entry?.amount);
  });

  it('MISMATCH — bang ke ghi LECH dung so tien goi khach khai', () => {
    const declared = dataset.scenarioTrips.find((trip) => trip.id === 'DEMO-FUEL-MISMATCH');
    const entry = tripOf('DEMO-FUEL-MISMATCH')?.fuelEntries[0];
    expect(entry).toBeDefined();
    expect((entry?.statementAmount as number) - (entry?.amount as number)).toBe(
      declared?.fuel?.statementDeltaVnd,
    );
  });

  /** HAI phieu, MOT dong — dieu kien de `runFuelMatching` tra `AMBIGUOUS_CANDIDATES`. */
  it('AMBIGUOUS — hai phieu trung nhau, chi mot trong hai co dong bang ke', () => {
    const entries = tripOf('DEMO-FUEL-AMBIGUOUS')?.fuelEntries ?? [];
    expect(entries.length).toBe(2);
    expect(entries[0]?.amount).toBe(entries[1]?.amount);
    expect(entries[0]?.odometerKm).toBe(entries[1]?.odometerKm);
    expect(entries.filter((entry) => entry.statementAmount !== null).length).toBe(1);
  });

  it('DONG MO COI — bang ke co dong ma khong phieu nao doi ung', () => {
    const orphans = plan.statements.flatMap((statement) =>
      statement.lines.filter((line) => line.fuelEntryKey === null),
    );
    expect(orphans.length).toBeGreaterThanOrEqual(1);
  });

  it('co it nhat mot phieu bi danh dau CAN KIEM TRA vi vuot dinh muc', () => {
    const flagged = plan.trips
      .flatMap((trip) => trip.fuelEntries)
      .filter((entry) => entry.reviewReasons.includes('CONSUMPTION_ABOVE_NORM'));
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cong no, tai san va giay to', () => {
  it('cong no khach co ca CON HAN, QUA HAN va DA THU', () => {
    const outcomes = new Set(
      plan.trips.map((trip) => trip.receivable).filter((value) => value !== null),
    );
    expect(outcomes).toContain('CURRENT');
    expect(outcomes).toContain('OVERDUE');
    expect(outcomes).toContain('PAID');
  });

  /**
   * QUA HAN PHAI LA MOT HE QUA CUA LICH, khong phai mot nhan dan tay.
   *
   * Han thanh toan cua chuyen `DEMO-CREDIT-WARNING` phai nam TRUOC moc ngay — neu no nam sau, man
   * hinh cong no se hien "qua han" tren mot chung tu con han, va do la dieu dau tien ke toan nhin
   * ra khi xem ban demo.
   */
  it('chuyen qua han co han thanh toan nam TRUOC moc ngay', () => {
    const trip = plan.trips.find((row) => row.scenarioId === 'DEMO-CREDIT-WARNING');
    expect(trip?.receivable).toBe('OVERDUE');
    expect(businessDateDifferenceInDays(trip?.dueDate as string, ANCHOR)).toBeGreaterThan(0);
  });

  it('chuyen thue xe ngoai mang gia phai tra nha xe, chuyen tu chay thi khong', () => {
    for (const trip of plan.trips) {
      if (trip.kind === 'EXTERNAL_CARRIER') {
        expect(trip.carrierCost, trip.code).not.toBeNull();
        expect(trip.carrierRef, trip.code).not.toBeNull();
      } else {
        expect(trip.carrierCost, trip.code).toBeNull();
      }
    }
  });

  it('lenh sua chua co ca lich su da hoan tat lan viec dang mo', () => {
    const statuses = new Set(plan.workOrders.map((order) => order.status));
    expect(statuses).toContain('COMPLETED');
    expect(statuses).toContain('OPEN');
  });

  /**
   * GIAY TO PHAI CO DU BA TRANG THAI — con han, sap het han, da het han.
   *
   * Tinh theo NGUONG CUA GOI KHACH (`expiryWarningDays`), khong theo mot con so go cung o day:
   * neu khach doi nguong, bai nay van hoi dung cau hoi.
   */
  it('giay to co du con han / sap het han / da het han quanh moc ngay', () => {
    const warningDays = loadTenantConfig().policies.transportCompliance?.expiryWarningDays ?? 30;

    const expired = plan.complianceDocuments.filter((doc) => doc.validTo < ANCHOR);
    const expiringSoon = plan.complianceDocuments.filter(
      (doc) =>
        doc.validTo >= ANCHOR && businessDateDifferenceInDays(ANCHOR, doc.validTo) <= warningDays,
    );
    const healthy = plan.complianceDocuments.filter(
      (doc) => businessDateDifferenceInDays(ANCHOR, doc.validTo) > warningDays,
    );

    expect(expired.length).toBeGreaterThanOrEqual(1);
    expect(expiringSoon.length).toBeGreaterThanOrEqual(1);
    expect(healthy.length).toBeGreaterThanOrEqual(1);
  });

  it('ky luong nam TRON trong qua khu va co khoan cong/tru nhap tay', () => {
    expect(plan.payroll.endDate < ANCHOR).toBe(true);
    expect(plan.payroll.startDate < plan.payroll.endDate).toBe(true);

    const kinds = new Set(plan.payroll.manualComponents.map((component) => component.kind));
    expect(kinds).toContain('EARNING');
    expect(kinds).toContain('DEDUCTION');
  });
});
