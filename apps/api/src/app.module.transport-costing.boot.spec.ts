import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-costing',
);

/**
 * MOT KHACH VAN TAI CO SO QUY phai boot duoc, va phai chay tron MOT VONG TAI CHINH that.
 *
 * `costing.composition.spec.ts` chi noi "provider nao co trong danh sach". Bai nay noi "Nest co
 * RESOLVE duoc chung khong" — va do la mot cau hoi khac han: mot token thieu provider
 * (`TransportCoreFacts`), mot factory nem luc khoi tao (`TRANSPORT_COSTING_POLICY`), hay mot phu
 * thuoc vong giua `TransportCostingModule` va `TransportModule` deu KHONG lo ra o tang danh sach.
 * Chung chi lo ra o mot lan boot that.
 *
 * Vong nghiep vu ben duoi cung la mot khang dinh: neu `INV-03` bi noi sai o tang wiring — vi du
 * `CostingRepository` bi tiem hai instance khac nhau — thi so du va gia thanh chuyen se khong con
 * doi soat duoc voi nhau, va bai nay do.
 */
describe('transport-costing process boot contract', () => {
  it('boot Nest that voi transport-core + transport-costing, chay tron mot vong tai chinh', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { TripService } = await import('./src/transport/trips/trip.service.ts');
      const { CostingService } = await import('./src/transport/costing/costing.service.ts');
      const { CostingReadService } = await import('./src/transport/costing/costing-read.service.ts');
      const { FundPeriodService } = await import('./src/transport/costing/fund-period.service.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const fleet = context.get(FleetService, { strict: false });
      const trips = context.get(TripService, { strict: false });
      const costing = context.get(CostingService, { strict: false });
      const read = context.get(CostingReadService, { strict: false });
      const periods = context.get(FundPeriodService, { strict: false });

      const vehicle = await fleet.registerVehicle({ registrationPlate: 'BOOT-T3-0001', vehicleClass: 'Xe tai' }, 'boot');
      const driver = await fleet.registerDriver({ fullName: 'Boot Driver T3', phone: '0900000003', licenceClass: 'C', licenceExpiry: '2029-01-01' }, 'boot');
      const trip = await trips.planTrip({ code: 'BOOT-T3-CH-1', kind: 'OWN_DIRECT', originLabel: 'A', destinationLabel: 'B', businessDate: '2026-08-10', freightAmount: 1000000 }, 'boot');
      await trips.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, 'boot');
      await trips.transition(trip.id, 'IN_TRANSIT', 'boot');

      // VONG TAI CHINH: ung tien khong gan chuyen -> chi tu quy cho chuyen -> dong ky.
      await costing.postAdvance({ driverId: driver.id, amount: 10000000, businessDate: '2026-08-10' }, 'boot');
      const posted = await costing.recordTripExpense({ tripId: trip.id, categoryCode: 'BOT', amount: 150000, fundedBy: 'DRIVER_FUND', driverId: driver.id, businessDate: '2026-08-11' }, 'boot');
      const statement = await read.driverFundStatement(driver.id);
      const breakdown = await read.tripCostBreakdown(trip.id);

      const period = await periods.openPeriod({ driverId: driver.id, startDate: '2026-08-01', endDate: '2026-08-31' }, 'boot');
      const closed = await periods.closePeriod(period.id, 'boot');

      // Ky da dong thi but toan lui ngay phai bi tu choi — cong INV-22 phai song trong tien trinh
      // that, khong chi trong bai test don vi.
      let frozenReason = 'KHONG BI CHAN';
      try {
        await costing.postAdvance({ driverId: driver.id, amount: 1000, businessDate: '2026-08-20' }, 'boot');
      } catch (error) { frozenReason = error.reason ?? error.name; }

      // Danh muc chi phi cua goi khach phai duoc cuong che: DAU_XE khong nam trong ba ma da khai.
      let categoryReason = 'KHONG BI CHAN';
      try {
        await costing.recordTripExpense({ tripId: trip.id, categoryCode: 'DAU_XE', amount: 1000, fundedBy: 'COMPANY_DIRECT', businessDate: '2026-09-01' }, 'boot');
      } catch (error) { categoryReason = error.reason ?? error.name; }

      const proof = {
        costing: has(CostingService),
        periods: has(FundPeriodService),
        orders: has(OrdersService),
        zalo: has(ZaloUserClient),
        sameCorrelation: posted.entry.correlationKey === posted.expense.correlationKey,
        balance: statement.balance,
        directCost: breakdown.directCost,
        snapshotClosing: closed.snapshot.closingBalance,
        periodStatus: closed.period.status,
        frozenReason,
        categoryReason,
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_COSTING_BOOT_PROOF>>' + JSON.stringify(proof));
    `;

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    delete env.FLOWISE_API_KEY;
    delete env.FLOWISE_BASE_URL;
    delete env.FLOWISE_FLOW_ID;
    delete env.ZALO_BOT_TOKEN;
    delete env.TENANT;
    env.TENANT_DIR = fixtureDir;
    env.PERSISTENCE = 'memory';
    env.NODE_ENV = 'test';

    const child = spawnSync(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
      { cwd: apiDir, env, encoding: 'utf8', timeout: 60_000 },
    );

    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    const proof = child.stdout.split('<<TRANSPORT_COSTING_BOOT_PROOF>>')[1];
    expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
    expect(JSON.parse(proof ?? '{}')).toEqual({
      costing: true,
      periods: true,
      // Khach van tai KHONG phai khai mot integration `parser` hay mot kenh Zalo nao de co so quy.
      orders: false,
      zalo: false,
      // `INV-03`: hai lop, MOT khoa.
      sameCorrelation: true,
      // 10.000.000 - 150.000
      balance: 9_850_000,
      directCost: 150_000,
      snapshotClosing: 9_850_000,
      periodStatus: 'CLOSED',
      // `INV-22` song trong tien trinh that, khong chi trong bai test don vi.
      frozenReason: 'FUND_ENTRY_PERIOD_FROZEN',
      // Danh muc cua goi khach duoc cuong che, khong phai mot goi y.
      categoryReason: 'EXPENSE_CATEGORY_UNKNOWN',
    });
  }, 70_000);
});
