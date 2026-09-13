import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-field-closeout',
);

/**
 * CHUNG TU VAN HANH PHAI DEN DUOC CONG NGHIEM THU CUA LANE K — `#279` O2, `#275` K2.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI, VA VI SAO KHONG BAI NAO KHAC THAY DUOC NO
 * ============================================================================================
 *
 * `CommercialAcceptanceService` nam TRONG `TransportAcceptanceModule`. Cong chung tu cua no
 * (`AcceptanceEvidenceFacts`) duoc buoc qua mot module `@Global()` — `TransportDocumentEvidenceBridgeModule`.
 * Neu cau noi do dut (mat `@Global()`, ngung xuat adapter, hoac bi go khoi `app-composition.ts`)
 * thi `tsc` van xanh, moi bai don vi van xanh, va Lane K lang le quay ve
 * `NoOperationalDocumentsAdapter` — moi lan ket thuc don theo can cu `DOCUMENT` bi tu choi, khong
 * mot dong canh bao nao.
 *
 * Bai nay chay mot TIEN TRINH THAT va do BON dieu:
 *
 *   1. mot `DELIVERY_RECEIPT` cua DON NAY thoa man cong `DOCUMENT` cua Lane K;
 *   2. `#279` O13 bai 8 — chinh to do KHONG thoa man DON KHAC;
 *   3. mot to DA BIA MO khong con thoa man gi (`#279` O2);
 *   4. `#279` O13 bai 9 — ghi `RETURNED_TO_OFFICE` KHONG ket thuc don: no van `PENDING` cho toi khi
 *      mot NGUOI bam tren truc cua Lane K.
 */
/**
 * KICH BAN chay trong mot TIEN TRINH RIENG. Tach ra khoi bai test de doan chu dai nay khong lam
 * phan khang dinh o tren kho doc.
 */
const SCRIPT = `
import { NestFactory } from '@nestjs/core';
const { AppModule } = await import('./src/app.module.ts');
const { DriverDocumentsController } = await import('./src/transport/document/driver-documents.controller.ts');
const { DocumentsController } = await import('./src/transport/document/documents.controller.ts');
const { OperationalDocumentService } = await import('./src/transport/document/document.service.ts');
const { PhysicalReceiptHandoverService } = await import('./src/transport/document/handover.service.ts');
const { CommercialAcceptanceService } = await import('./src/transport/acceptance/acceptance.service.ts');
const { AcceptanceEvidenceFacts } = await import('./src/transport/acceptance/acceptance-facts.port.ts');
const { MovementService } = await import('./src/transport/movement/movement.service.ts');
const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
const { DriverFieldReadService } = await import('./src/transport/field/field-read.service.ts');
const { DriverFieldController } = await import('./src/transport/field/driver-field.controller.ts');

const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
const reasonOf = async (run) => {
  try { await run(); return 'NO_ERROR_THROWN'; } catch (error) { return error?.reason ?? String(error); }
};

const fleet = context.get(FleetService, { strict: false });
const movement = context.get(MovementService, { strict: false });
const documents = context.get(OperationalDocumentService, { strict: false });
const handovers = context.get(PhysicalReceiptHandoverService, { strict: false });
const acceptance = context.get(CommercialAcceptanceService, { strict: false });
const evidence = context.get(AcceptanceEvidenceFacts, { strict: false });
const field = context.get(DriverFieldReadService, { strict: false });

const vehicle = await fleet.registerVehicle({ registrationPlate: '29H-33333', vehicleClass: 'Dau keo' }, 'boot');
const driver = await fleet.registerDriver({
  fullName: 'Lai xe Closeout', phone: '0900000003', licenceClass: 'FC',
  licenceExpiry: '2030-01-01', authUserId: 'boot-driver',
}, 'boot');

const orderA = await movement.createOrder({ code: 'ORD-CO-A', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong' }, 'boot');
const orderB = await movement.createOrder({ code: 'ORD-CO-B', originLabel: 'Ha Noi', destinationLabel: 'Ninh Binh' }, 'boot');

const run = await movement.createRun({ code: 'RUN-CO-1', vehicleId: vehicle.id }, 'boot');
await movement.assignRun(run.id, { driverId: driver.id }, 'boot');
const legA = await movement.addLeg(run.id, {
  sequence: 1, kind: 'LOADED', orderId: orderA.id,
  originLabel: 'Ha Noi', destinationLabel: 'Hai Phong', distanceKm: 105,
}, 'boot');
await movement.addLeg(run.id, {
  sequence: 2, kind: 'LOADED', orderId: orderB.id,
  originLabel: 'Ha Noi', destinationLabel: 'Ninh Binh', distanceKm: 95,
}, 'boot');
await movement.transitionRun(run.id, 'ACTIVE', 'boot');

// Hai to: mot bien nhan cua don A, mot ban nhap se bia mo. Ca hai qua duong VAN HANH.
const receiptA = await documents.recordAsOperator({
  type: 'DELIVERY_RECEIPT', runId: run.id, legId: legA.id,
  basis: 'EXTERNAL_PHYSICAL', externalNote: 'Bien nhan giay co chu ky nguoi nhan',
  clientEventId: 'co-1', authUserId: 'boot-office',
});
const draft = await documents.recordAsOperator({
  type: 'OTHER', runId: run.id, legId: legA.id,
  basis: 'EXTERNAL_PHYSICAL', externalNote: 'Ban nhap, se bia mo',
  clientEventId: 'co-2', authUserId: 'boot-office',
});
await documents.withdraw({ documentId: draft.id, reason: 'chup nham', authUserId: 'boot-admin' });

// Don phai DA GIAO XONG truoc khi ket thuc thuong mai duoc — cong cua chinh Lane K.
await movement.transitionOrder(orderA.id, 'FULFILLED', 'boot');
await movement.transitionOrder(orderB.id, 'FULFILLED', 'boot');

const evidenceCountForOrderA = await evidence.countFor(orderA.id);

// MAN HINH HIEN TRUONG (O9) — doc qua DI that, tren chinh vong chay vua dung.
const work = await field.workFor('boot-driver');
const firstLeg = work.runs[0]?.legs[0] ?? null;
const fieldActionLabels = (firstLeg?.nextActions ?? []).map((action) => action.label);
const fieldMissingDocuments = firstLeg?.missingDocumentTypes ?? [];
const MONEY = ['freight', 'revenue', 'margin', 'amount', 'currency', 'salary', 'allowance'];
const fieldMoneyKeys = [];
const walk = (node) => {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  for (const key of Object.keys(node)) {
    if (MONEY.some((needle) => key.toLowerCase().includes(needle))) fieldMoneyKeys.push(key);
    walk(node[key]);
  }
};
walk(work);

// CHUOI BAN GIAO, ghi TRUOC khi ai bam ket thuc — de do dung dieu O13 bai 9.
await handovers.recordAsDriver({
  orderId: orderA.id, documentId: receiptA.id,
  clientEventId: 'ho-1', authUserId: 'boot-driver',
});
await handovers.recordAsOffice({
  orderId: orderA.id, state: 'RETURNED_TO_OFFICE', documentId: receiptA.id,
  clientEventId: 'ho-2', authUserId: 'boot-office',
});
const handoverStateBeforeAcceptance = (await handovers.statusOf(orderA.id)).state;
const acceptanceStateAfterHandover = (await acceptance.detailForOrder(orderA.id)).acceptance.state;
const eligibilityAfterHandover = (await acceptance.eligibilityForOrder(orderA.id)).kind;

// O13 bai 8 — to bien nhan cua don A khong thoa man don B.
const foreignOrderReason = await reasonOf(() => acceptance.decide({
  orderId: orderB.id, outcome: 'APPROVED', reasonCode: 'DOCUMENT_OK', basis: 'DOCUMENT',
  evidenceRefs: [receiptA.id], externalNote: null, counterpartyId: null,
  supersedesId: null, idempotencyKey: 'k-b', authUserId: 'boot-accounting',
}));

// O2 — mot to DA BIA MO khong con thoa man gi.
const withdrawnEvidenceReason = await reasonOf(() => acceptance.decide({
  orderId: orderA.id, outcome: 'APPROVED', reasonCode: 'DOCUMENT_OK', basis: 'DOCUMENT',
  evidenceRefs: [draft.id], externalNote: null, counterpartyId: null,
  supersedesId: null, idempotencyKey: 'k-w', authUserId: 'boot-accounting',
}));

// Va duong DUNG: to bien nhan cua chinh don A.
const accepted = await acceptance.decide({
  orderId: orderA.id, outcome: 'APPROVED', reasonCode: 'DOCUMENT_OK', basis: 'DOCUMENT',
  evidenceRefs: [receiptA.id], externalNote: null, counterpartyId: null,
  supersedesId: null, idempotencyKey: 'k-a', authUserId: 'boot-accounting',
});

const proof = {
  driverDocumentsController: has(DriverDocumentsController),
  documentsController: has(DocumentsController),
  driverFieldController: has(DriverFieldController),
  evidenceCountForOrderA,
  fieldActionLabels,
  fieldMissingDocuments,
  fieldMoneyKeys,
  acceptedWithDocumentBasis: accepted.acceptance.state,
  foreignOrderReason,
  withdrawnEvidenceReason,
  handoverStateBeforeAcceptance,
  acceptanceStateAfterHandover,
  eligibilityAfterHandover,
};
await context.close();
process.stdout.write('<<TRANSPORT_FIELD_CLOSEOUT_BOOT_PROOF>>' + JSON.stringify(proof));
`;

describe('transport field closeout process boot contract', () => {
  it(
    'boot Nest that: chung tu van hanh thoa man cong nghiem thu, va ban giao KHONG ket thuc don',
    () => {
      const script = SCRIPT;
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
      const proof = child.stdout.split('<<TRANSPORT_FIELD_CLOSEOUT_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        driverDocumentsController: true,
        documentsController: true,
        driverFieldController: true,
        /* Cong chung tu CON SONG: mot to bien nhan cua don nay duoc chap nhan. */
        evidenceCountForOrderA: 1,
        /*
         * `#279` O9 — man hinh lai xe noi VIEC KE TIEP bang tieng Viet, khong noi ten enum.
         *
         * Chang nay moi co mot to `DELIVERY_RECEIPT` ghi qua duong VAN HANH (khong moc nao), nen
         * viec dau tien va duy nhat con lai la den diem lay hang.
         */
        fieldActionLabels: ['Đã tới điểm lấy hàng'],
        /* Chang CO HANG, va chinh sach ho so B doi mot bien nhan — da co, nen khong con thieu gi. */
        fieldMissingDocuments: [],
        /* `#279` O9 + `INV-09` — khong mot khoa nao co mui tien trong payload cua lai xe. */
        fieldMoneyKeys: [],
        acceptedWithDocumentBasis: 'APPROVED',
        /* `#279` O13 bai 8 — chinh to do khong thoa man don khac. */
        foreignOrderReason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER',
        /* `#279` O2 — mot to da bia mo khong con thoa man gi. */
        withdrawnEvidenceReason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER',
        /* `#279` O13 bai 9 — ban giao KHONG ket thuc don. */
        handoverStateBeforeAcceptance: 'RETURNED_TO_OFFICE',
        acceptanceStateAfterHandover: 'PENDING',
        eligibilityAfterHandover: 'BLOCKED',
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
