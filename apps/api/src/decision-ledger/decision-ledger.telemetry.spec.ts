import { beforeEach, describe, expect, it } from 'vitest';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import type { TelemetryRecord, TelemetrySink } from '../observability/telemetry-record.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { InMemorySourceRegistryRepository } from '../source-registry/in-memory-source-registry.repository.js';
import { testTenantScope } from '../source-registry/tenant-scope.js';
import { DecisionLedgerService } from './decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from './in-memory-decision-ledger.repository.js';

/**
 * MUC 12 hop dong nhiem vu — MOT lan ghi so cai phat MOT dau vet quan sat, va hai thu NOI DUOC
 * voi nhau.
 *
 * Muc tieu cua muc 12 duoc phat bieu lai thanh mot bai test:
 *
 *   BusinessDecision.id  <->  traceId/spanId  <->  releaseSha  <->  ca nghiep vu
 *
 * Neu duong noi nay dut, Debug View van hien mot quyet dinh nhung khong di duoc tu do sang bang
 * chung ben vung — tuc mat phang quan sat va mat phang su that nghiep vu ke hai cau chuyen roi rac.
 */

const GATE = defineDecisionVocabulary({
  owner: 'test-domain',
  points: ['gate.evaluate'],
  labels: { GATE_CLOSED: 'Cong dong' },
});

const TENANT = testTenantScope('t-alpha');
const RELEASE_SHA = 'a'.repeat(40);

class RecordingSink implements TelemetrySink {
  readonly records: TelemetryRecord[] = [];
  record(record: TelemetryRecord): void {
    this.records.push(record);
  }
}

let sink: RecordingSink;
let telemetry: TelemetryService;
let ledger: DecisionLedgerService;

beforeEach(() => {
  sink = new RecordingSink();
  telemetry = new TelemetryService();
  telemetry.configure({
    release: {
      tenant: 't-alpha',
      environment: 'test',
      gitSha: RELEASE_SHA,
      source: 'env',
    },
    privacy: 'redacted',
    sinks: [sink],
  });
  ledger = new DecisionLedgerService(
    new InMemoryDecisionLedgerRepository(),
    telemetry,
    new InMemorySourceRegistryRepository(),
  );
});

const decisions = () => sink.records.filter((row) => row.type === 'decision');

describe('so cai va telemetry ke CUNG mot cau chuyen', () => {
  it('hang so cai va ban ghi telemetry deu tro ve cung mot luot, va noi duoc voi nhau', async () => {
    const written = await telemetry.runTurn({ orderId: 'case_1' }, async () =>
      ledger.record({
        scope: TENANT,
        vocabulary: GATE,
        point: 'gate.evaluate',
        outcome: 'denied',
        reason: 'GATE_CLOSED',
        subject: { type: 'case', id: 'case_1' },
        occurrence: { kind: 'turn', traceId: 'khong-dung-den' },
        actorKind: 'DETERMINISTIC_RULE',
      }),
    );

    const decision = written.decision;
    if (!decision) throw new Error('phai ghi duoc');

    const emitted = decisions();
    expect(emitted).toHaveLength(1);
    const event = emitted[0];
    if (!event || event.type !== 'decision') throw new Error('phai co ban ghi quyet dinh');

    // 1. Telemetry mang ID cua hang so cai — day la soi day di TU quan sat SANG bang chung.
    expect(event.detail).toMatchObject({
      ledgerId: decision.id,
      ledgerPoint: 'gate.evaluate',
      ledgerReason: 'GATE_CLOSED',
      subjectType: 'case',
      subjectId: 'case_1',
    });

    // 2. Hang so cai mang `traceId` cua luot — day la soi day di NGUOC lai.
    expect(decision.traceId).toBe(event.traceId);
    expect(decision.traceId).toMatch(/^[0-9a-f]{32}$/);

    // 3. Ambient trace THANG `occurrence.traceId`: hang phai tro ve trace ma code THUC SU chay
    //    trong, khong phai mot chuoi ben goi tu dat.
    expect(decision.traceId).not.toBe('khong-dung-den');

    // 4. Ban phat hanh duoc ghi vao CA HAI mat phang.
    expect(decision.releaseSha).toBe(RELEASE_SHA);
    expect(event.releaseSha).toBe(RELEASE_SHA);

    // 5. So cai KHONG chua payload OTel — chi ba neo. `detail` cua hang la thu ta tu dat.
    expect(Object.keys(decision)).not.toContain('attributes');
  });

  it('lan CHAY LAI phat mot ma ly do KHAC — dem duoc so lan thu lai that su', async () => {
    const write = () =>
      ledger.record({
        scope: TENANT,
        vocabulary: GATE,
        point: 'gate.evaluate',
        outcome: 'denied',
        reason: 'GATE_CLOSED',
        subject: { type: 'case', id: 'case_1' },
        occurrence: { kind: 'externalKey', key: 'k1' },
        actorKind: 'DETERMINISTIC_RULE',
      });

    await write();
    await write();

    expect(decisions().map((row) => (row.type === 'decision' ? row.reason : ''))).toEqual([
      'LEDGER_RECORDED',
      'LEDGER_IDEMPOTENT_REPLAY',
    ]);
  });

  it('telemetry hong KHONG lam hong lan ghi so cai', async () => {
    // Bat bien so mot cua tang quan sat, ap vao ca duong nay: so cai la nghiep vu, telemetry la
    // quan sat. Mot sink hong khong duoc lam mat mot ban ghi nghiep vu.
    const broken = new TelemetryService();
    broken.configure({
      release: { tenant: 't-alpha', environment: 'test', gitSha: RELEASE_SHA, source: 'env' },
      privacy: 'redacted',
      sinks: [
        {
          record: () => {
            throw new Error('sink hong');
          },
        },
      ],
    });
    const service = new DecisionLedgerService(
      new InMemoryDecisionLedgerRepository(),
      broken,
      new InMemorySourceRegistryRepository(),
    );

    await expect(
      service.record({
        scope: TENANT,
        vocabulary: GATE,
        point: 'gate.evaluate',
        outcome: 'denied',
        reason: 'GATE_CLOSED',
        subject: { type: 'case', id: 'case_1' },
        occurrence: { kind: 'turn', traceId: 't1' },
        actorKind: 'DETERMINISTIC_RULE',
      }),
    ).resolves.toMatchObject({ persisted: true });
  });

  it('KHONG co telemetry thi so cai van ghi day du — chi mat cau noi sang trace', async () => {
    const service = new DecisionLedgerService(
      new InMemoryDecisionLedgerRepository(),
      undefined,
      new InMemorySourceRegistryRepository(),
    );
    const result = await service.record({
      scope: TENANT,
      vocabulary: GATE,
      point: 'gate.evaluate',
      outcome: 'denied',
      reason: 'GATE_CLOSED',
      subject: { type: 'case', id: 'case_1' },
      occurrence: { kind: 'turn', traceId: 't1' },
      actorKind: 'DETERMINISTIC_RULE',
    });
    expect(result.decision).toMatchObject({ reasonCode: 'GATE_CLOSED', traceId: 't1' });
    // `unknown` khong di tiep nhu mot gia tri that — mot lien ket sai tu tin te hon mot o trong.
    expect(result.decision?.releaseSha).toBeNull();
  });
});
