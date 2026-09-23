import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** GOI KHACH THAT — cung ly le voi `app.module.transport-preview.boot.spec.ts`. */
const previewTenantDir = resolve(apiDir, '../../tenants/transport-preview');

/**
 * PHAN BO GIA THANH NHIEN LIEU PHAI DEN DUOC BIEN TRUC TIEP CUA VONG CHAY — `#369` R-1, do o muc
 * TIEN TRINH. Va cung mot lan boot do luon duong Quy lai xe Run-first (`#369` R-4).
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI, VA VI SAO KHONG MOT BAI NAO KHAC THAY DUOC NO
 * ============================================================================================
 *
 * `OperatingMetricsReadService` la mot provider NAM TRONG `TransportAnalyticsModule`. Cong sang lop
 * phan bo duoc CAM VAO tu ngoai, boi `TransportFuelAnalyticsBridgeModule` (`@Global()`). Neu cau noi
 * do dut — mat `@Global()`, ngung xuat token, hoac bi go khoi `app-composition.ts` — thi:
 *
 *   · `tsc` van xanh, vi khong kieu nao doi;
 *   · `operating-metrics.spec.ts` van xanh, vi no tu tay truyen cac dong phan bo vao ham thuan;
 *   · `transport-analytics-fuel-attribution.int.spec.ts` van xanh, vi no tu tay dung dich vu;
 *   · bai composition van xanh, vi no chi doi chieu DANH SACH ten module;
 *
 * va bien truc tiep cua vong chay lang le BO QUA toan bo chi phi nhien lieu Run-first. Con so doc
 * len van "hop ly" — chi thap hon su that dung bang so tien dau da phan bo, va khong mot dong canh
 * bao nao. `unavailableSources` la phep do NHAY NHAT cho mot cau noi bi dut: `@Optional()` khong nem,
 * no chi tra ve `undefined`.
 *
 * ============================================================================================
 * BON DIEU BAI NAY DO, tren mot lan boot Nest THAT (kho trong bo nho, khong Postgres)
 * ============================================================================================
 *
 *   1. `unavailableSources` RONG — cau noi con song;
 *   2. `directCost` = phan bo dich `RUN` + dich `LEG`, tach dung nguon (`costSources`), va chang
 *      nhan dung phan cua no (`legCosts`);
 *   3. phieu Run-first `DRIVER_CASH` duyet xong tru DUNG so tien do khoi Quy lai xe (`#369` R-4 qua
 *      DI that), va so tien do KHONG vao `directCost` khi chua ai phan bo — Quy va gia thanh la hai
 *      so cai khac nhau;
 *   4. phan da phan bo cua phieu tien mat vao `directCost` DUNG MOT LAN sau khi ke toan quyet.
 */
const SCRIPT = `
import { NestFactory } from '@nestjs/core';
const { AppModule } = await import('./src/app.module.ts');
const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
const { MovementService } = await import('./src/transport/movement/movement.service.ts');
const { FuelRepository } = await import('./src/transport/fuel/fuel.repository.ts');
const { FuelService } = await import('./src/transport/fuel/fuel.service.ts');
const { FuelCostAttributionService } = await import('./src/transport/fuel/fuel-cost-attribution.service.ts');
const { OperatingMetricsReadService } = await import('./src/transport/analytics/operating-metrics-read.service.ts');
const { CostingReadService } = await import('./src/transport/costing/costing-read.service.ts');

const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
const fleet = context.get(FleetService, { strict: false });
const movement = context.get(MovementService, { strict: false });
const fuelRepo = context.get(FuelRepository, { strict: false });
const fuel = context.get(FuelService, { strict: false });
const attribution = context.get(FuelCostAttributionService, { strict: false });
const metrics = context.get(OperatingMetricsReadService, { strict: false });
const fundRead = context.get(CostingReadService, { strict: false });

const vehicle = await fleet.registerVehicle({
  registrationPlate: 'BOOT-369-A', vehicleClass: 'Dau keo', allowedPayloadKg: 5000,
}, 'boot');
const driver = await fleet.registerDriver({
  fullName: 'Lai xe R1', phone: '0900369001', licenceClass: 'FC',
  licenceExpiry: '2030-01-01', authUserId: 'boot-driver-369',
}, 'boot');
const supplier = await fuelRepo.createSupplier({
  name: 'Cay xang boot 369', code: 'BOOT-369-CX', phone: null, address: null, taxCode: null,
  at: new Date('2026-09-23T00:00:00.000Z'),
});

const run = await movement.createRun({
  code: 'BOOT-369-RUN', vehicleId: vehicle.id, businessDate: '2026-09-23',
}, 'boot');
const loaded = await movement.addLeg(run.id, {
  sequence: 1, kind: 'LOADED', originLabel: 'Kho A', destinationLabel: 'Kho B',
  businessDate: '2026-09-23', distanceKm: 100,
}, 'boot');
const empty = await movement.addLeg(run.id, {
  sequence: 2, kind: 'EMPTY', originLabel: 'Kho B', destinationLabel: 'Bai xe',
  businessDate: '2026-09-23', distanceKm: 100,
}, 'boot');
await movement.assignRun(run.id, { driverId: driver.id }, 'boot');

const submit = async (patch) => fuel.submitFuelEntry({
  runId: run.id, driverId: driver.id, supplierId: supplier.id,
  liters: '100', amount: 2000000, odometerKm: 100000,
  occurredAt: '2026-09-23T04:30:00.000Z', businessDate: '2026-09-23',
  paymentMethod: 'SUPPLIER_ACCOUNT', invoiceNo: null, note: null,
  correlationKey: 'boot-369-' + patch.tag, ...patch,
}, 'boot');

// Phieu 1 — cay xang ghi no: phan bo 1.200.000 cho CA vong chay, 500.000 cho chang co hang.
const billed = await submit({ tag: 'billed', legId: loaded.id });
await fuel.verifyFuelEntry(billed.id, 'boot-ke-toan');
await attribution.attribute(billed.id, {
  target: { kind: 'RUN', runId: run.id }, amount: 1200000, correlationKey: 'boot-369-attr-run',
}, 'boot-ke-toan');
await attribution.attribute(billed.id, {
  target: { kind: 'LEG', legId: loaded.id }, amount: 500000, correlationKey: 'boot-369-attr-leg',
}, 'boot-ke-toan');

// Phieu 2 — lai xe ung tien mat tren chinh vong chay do (#369 R-4).
const cash = await submit({
  tag: 'cash', legId: empty.id, paymentMethod: 'DRIVER_CASH', amount: 900000,
  liters: '40', odometerKm: 100400, occurredAt: '2026-09-23T08:00:00.000Z',
});
const verifiedCash = await fuel.verifyFuelEntry(cash.id, 'boot-ke-toan');
const marginBeforeAttribution = await metrics.runMargin(run.id);
const fundAfterCash = await fundRead.driverFundStatement(driver.id);

await attribution.attribute(cash.id, {
  target: { kind: 'LEG', legId: empty.id }, amount: 900000, correlationKey: 'boot-369-attr-cash',
}, 'boot-ke-toan');
const margin = await metrics.runMargin(run.id);

const proof = {
  unavailableSources: [...margin.unavailableSources],
  directCostBeforeCashAttribution: marginBeforeAttribution.directCost,
  directCost: margin.directCost,
  costSources: margin.costSources,
  runLevelCost: margin.runLevelCost,
  legCosts: margin.legCosts.map((leg) => ({
    kind: leg.legId === loaded.id ? 'LOADED' : leg.legId === empty.id ? 'EMPTY' : 'KHAC',
    legacyTripExpense: leg.legacyTripExpense,
    fuelCostAttribution: leg.fuelCostAttribution,
  })),
  attributionRowCount: margin.fuelCostAttributionIds.length,
  tripIds: [...margin.tripIds],
  /* Quy lai xe: mot but toan AM dung so tien phieu tien mat, va phieu tro toi no. */
  driverFundBalance: fundAfterCash.balance,
  driverFundKinds: fundAfterCash.entries.map((entry) => entry.kind),
  driverFundRunIds: fundAfterCash.entries.map((entry) => entry.runId === run.id),
  cashLegLinked: verifiedCash.driverFundEntryId === fundAfterCash.entries[0]?.id,
  cashCostExpenseId: verifiedCash.costExpenseId,
};
await context.close();
process.stdout.write('<<TRANSPORT_FUEL_MARGIN_BOOT_PROOF>>' + JSON.stringify(proof));
`;

describe('transport fuel margin process boot contract', () => {
  it(
    'boot Nest that: phan bo gia thanh Run-first vao bien vong chay, Quy lai xe tach rieng',
    () => {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.FLOWISE_API_KEY;
      delete env.FLOWISE_BASE_URL;
      delete env.FLOWISE_FLOW_ID;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = previewTenantDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', SCRIPT],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<TRANSPORT_FUEL_MARGIN_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        /* Cau noi CON SONG — phep do nhay nhat cua ca bai. */
        unavailableSources: [],
        /* Tien mat lai xe da vao Quy nhung CHUA ai phan bo: gia thanh vong chay chua nhan dong nao. */
        directCostBeforeCashAttribution: 1_700_000,
        directCost: 2_600_000,
        costSources: { legacyTripExpense: 0, fuelCostAttribution: 2_600_000 },
        runLevelCost: 1_200_000,
        legCosts: [
          { kind: 'LOADED', legacyTripExpense: 0, fuelCostAttribution: 500_000 },
          { kind: 'EMPTY', legacyTripExpense: 0, fuelCostAttribution: 900_000 },
        ],
        attributionRowCount: 3,
        /* Khong mot chuyen v1 nao — ca vong chay nay chay bang duong Run-first. */
        tripIds: [],
        driverFundBalance: -900_000,
        driverFundKinds: ['RUN_EXPENSE'],
        driverFundRunIds: [true],
        cashLegLinked: true,
        cashCostExpenseId: null,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
