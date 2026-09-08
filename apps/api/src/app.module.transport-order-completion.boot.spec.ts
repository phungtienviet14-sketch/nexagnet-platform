import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-order-completion',
);

/**
 * `#275` Lane K — CONG KET THUC DON phai chay duoc TRONG MOT TIEN TRINH THAT.
 *
 * ============================================================================================
 * VI SAO MOT BAI COMPOSITION KHONG DU
 * ============================================================================================
 *
 * `acceptance.composition.spec.ts` chi noi "controller nao co trong danh sach". Bai nay noi "Nest
 * co RESOLVE duoc chung khong" — va do la mot cau hoi khac han. Lane nay them mot phu thuoc CUNG
 * moi:
 *
 *     transport-settlement  ──imports──▶  transport-acceptance  ──▶  transport-core
 *
 * Mot vong phu thuoc giua hai module, mot token thieu provider (`SettlementOrderCompletionGate`),
 * hay mot `CommercialAcceptanceService` khong duoc `exports` deu KHONG lo ra o tang danh sach.
 * Chung chi lo ra o mot lan boot that — hoac o mot lan deploy that, muon hon nhieu.
 *
 * ============================================================================================
 * VA VONG NGHIEP VU BEN DUOI CUNG LA MOT KHANG DINH
 * ============================================================================================
 *
 * Kich ban chay dung ba buoc cua `#275`: don giao xong nhung CHUA ai ket thuc thi bi chan; ke toan
 * ghi mot quyet dinh; cung mot lenh do bay gio di qua. Chuyen duoc chon la mot chuyen THUE NHA XE
 * NGOAI — thu ma phep chieu dieu hanh tu choi — nen bai nay dong thoi chung minh rang cong khong
 * con phu thuoc vao viec co mot vong chay hay khong.
 */
describe('transport order completion process boot contract', () => {
  it(
    'boot Nest that voi transport-acceptance + transport-settlement, chay tron mot vong ket thuc don',
    () => {
      const script = [
        "import { NestFactory } from '@nestjs/core';",
        "const { AppModule } = await import('./src/app.module.ts');",
        "const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');",
        "const { TripService } = await import('./src/transport/trips/trip.service.ts');",
        "const { MovementService } = await import('./src/transport/movement/movement.service.ts');",
        "const { CommercialAcceptanceService } = await import('./src/transport/acceptance/acceptance.service.ts');",
        "const { SettlementService } = await import('./src/transport/settlement/settlement.service.ts');",
        "const { SettlementOrderCompletionGate } = await import('./src/transport/settlement/settlement-order-completion.port.ts');",
        '',
        "const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });",
        'const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };',
        '',
        'const fleet = context.get(FleetService, { strict: false });',
        'const trips = context.get(TripService, { strict: false });',
        'const movement = context.get(MovementService, { strict: false });',
        'const acceptance = context.get(CommercialAcceptanceService, { strict: false });',
        'const settlement = context.get(SettlementService, { strict: false });',
        '',
        "const customer = await fleet.createCustomer({ name: 'Boot K Customer' }, 'boot');",
        "const carrier = await fleet.createPartner({ name: 'Boot K Carrier', roles: ['CARRIER'] }, 'boot');",
        "const trip = await trips.planTrip({ code: 'BOOT-K-CH-1', kind: 'EXTERNAL_CARRIER', originLabel: 'A', destinationLabel: 'B', businessDate: '2026-09-08', freightAmount: 4000000, customerId: customer.id, carrierPartnerId: carrier.id }, 'boot');",
        "await trips.transition(trip.id, 'IN_TRANSIT', 'boot');",
        "await trips.transition(trip.id, 'DELIVERED', 'boot');",
        "await trips.transition(trip.id, 'RECONCILED', 'boot');",
        '',
        '// Chua co don nao lam chu the -> cong DONG. Khong con duong vong NOT_PROJECTED.',
        "let noOrderReason = 'KHONG BI CHAN';",
        "try { await settlement.recogniseCustomerReceivable(trip.id, 'boot'); }",
        'catch (error) { noOrderReason = error.reason ?? error.name; }',
        '',
        '// CHIEU THUONG MAI chay duoc tren chuyen THUE NGOAI, thu ma chieu dieu hanh tu choi.',
        "const projection = await movement.projectTripOrder(trip.id, 'boot');",
        "let operationalRefusal = 'KHONG BI CHAN';",
        "try { await movement.projectTrip(trip.id, 'boot'); }",
        'catch (error) { operationalRefusal = error.reason ?? error.name; }',
        '',
        '// Don da co nhung chua giao xong -> van chan.',
        "let notFulfilledReason = 'KHONG BI CHAN';",
        "try { await settlement.recogniseCustomerReceivable(trip.id, 'boot'); }",
        'catch (error) { notFulfilledReason = error.reason ?? error.name; }',
        '',
        "await movement.transitionOrder(projection.order.id, 'FULFILLED', 'boot');",
        '',
        '// Giao xong nhung chua ai ket thuc -> VAN chan.',
        "let pendingReason = 'KHONG BI CHAN';",
        "try { await settlement.recogniseCustomerReceivable(trip.id, 'boot'); }",
        'catch (error) { pendingReason = error.reason ?? error.name; }',
        '',
        '// KE TOAN ghi quyet dinh ket thuc.',
        'const decided = await acceptance.decide({',
        '  orderId: projection.order.id,',
        "  outcome: 'APPROVED',",
        "  reasonCode: 'DOCUMENT_RECEIVED',",
        "  basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',",
        '  evidenceRefs: [],',
        "  externalNote: 'B giu ban goc phieu giao',",
        '  counterpartyId: null,',
        '  supersedesId: null,',
        "  idempotencyKey: 'boot-k-idem-1',",
        "  authUserId: 'ke-toan-boot',",
        '});',
        '',
        "const first = await settlement.recogniseCustomerReceivable(trip.id, 'boot');",
        "const again = await settlement.recogniseCustomerReceivable(trip.id, 'boot');",
        '',
        'const proof = {',
        '  gate: has(SettlementOrderCompletionGate),',
        '  acceptance: has(CommercialAcceptanceService),',
        '  orderCode: projection.order.code,',
        '  noOrderReason,',
        '  operationalRefusal,',
        '  notFulfilledReason,',
        '  pendingReason,',
        '  state: decided.acceptance.state,',
        '  decidedBy: decided.decisions[0].decidedBy,',
        '  recognisedAmount: first.document.signedAmount,',
        '  replayedFirst: first.replayed,',
        '  replayedAgain: again.replayed,',
        '  sameDocument: first.document.id === again.document.id,',
        '};',
        'await context.close();',
        "process.stdout.write('<<ORDER_COMPLETION_BOOT_PROOF>>' + JSON.stringify(proof));",
      ].join('\n');

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
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<ORDER_COMPLETION_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        gate: true,
        acceptance: true,
        // Ma don TAT DINH tu ma chuyen — cung phep tinh voi phep chieu dieu hanh.
        orderCode: 'ORD-BOOT-K-CH-1',
        // `#275` K5: vang mat cua don DONG cong, khong cho qua.
        noOrderReason: 'SETTLEMENT_ORDER_NOT_LINKED',
        // Va phep chieu DIEU HANH van tu choi dung chuyen do — hai phep chieu, hai dieu kien.
        operationalRefusal: 'PROJECTION_TRIP_OUTSOURCED',
        notFulfilledReason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
        pendingReason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
        state: 'APPROVED',
        decidedBy: 'ke-toan-boot',
        recognisedAmount: 4_000_000,
        replayedFirst: false,
        // DUNG MOT LAN: lan goi thu hai tra ve chinh chung tu cu.
        replayedAgain: true,
        sameDocument: true,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
