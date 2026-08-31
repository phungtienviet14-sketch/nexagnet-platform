import { readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';
import { InMemorySourceRegistryRepository } from '../../source-registry/in-memory-source-registry.repository.js';
import { testTenantScope, type TenantScope } from '../../source-registry/tenant-scope.js';
import { DecisionLedgerService } from '../decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from '../in-memory-decision-ledger.repository.js';

/**
 * BAN CHUNG MINH C — DUNG MOT API cho hai vertical.
 *
 * Hai ban chung minh A va B doc rieng thi moi ban chi noi duoc "mien cua toi ghi duoc so cai".
 * Tep nay noi cai con lai, va la cai that su quan trong voi muc 8 hop dong: chung ghi bang CUNG
 * MOT thu, va cot loi so cai KHONG re nhanh theo mien nao.
 *
 * Hai bai duoi tan cong tu hai phia:
 *   1. HANH VI — cung mot chuoi lenh, chay cho mot khach ban hang va mot khach van tai, cho ra
 *      cung mot hinh dang ket qua. Tham so khac nhau; duong di khong.
 *   2. CAU TRUC — code cua tang nen KHONG chua ten khach nao va khong chua thuat ngu cua mot
 *      vertical nao.
 */

let ledger: DecisionLedgerService;

beforeEach(() => {
  ledger = new DecisionLedgerService(
    new InMemoryDecisionLedgerRepository(),
    undefined,
    new InMemorySourceRegistryRepository(),
  );
});

/**
 * MOT kich ban duy nhat: ghi -> chay lai -> quyet dinh that su khac -> sua.
 * Khong mot tham so nao trong day noi ve "loai khach"; chung chi la chuoi.
 */
async function runScenario(
  scope: TenantScope,
  input: { readonly point: string; readonly subjectType: string; readonly reason: string },
) {
  const vocabulary = defineDecisionVocabulary({
    owner: scope.tenantId,
    points: [input.point],
    labels: { [input.reason]: 'Ly do cua mien nay', OTHER: 'Ly do khac' },
  });
  const base = {
    scope,
    vocabulary,
    point: input.point,
    outcome: 'denied',
    reason: input.reason,
    subject: { type: input.subjectType, id: 'subject_1' },
    actorKind: 'DETERMINISTIC_RULE',
  } as const;

  const first = await ledger.record({
    ...base,
    occurrence: { kind: 'turn', traceId: 't1' },
  } as never);
  const replay = await ledger.record({
    ...base,
    occurrence: { kind: 'turn', traceId: 't1' },
  } as never);
  await ledger.record({ ...base, occurrence: { kind: 'turn', traceId: 't2' } } as never);
  await ledger.correct({
    scope,
    correctsDecisionId: first.decision?.id ?? '',
    vocabulary,
    point: input.point,
    outcome: 'allowed',
    reason: 'OTHER',
    occurrence: { kind: 'turn', traceId: 't3' },
    actorKind: 'HUMAN',
  } as never);

  const timeline = await ledger.timelineForSubject(scope, input.subjectType, 'subject_1');
  return {
    replayed: replay.replayed,
    timelineLength: timeline.length,
    statuses: timeline.map((row) => row.status),
    outcomes: timeline.map((row) => row.outcome),
  };
}

describe('C1 — hai vertical, mot API', () => {
  it('khach ban hang va khach van tai di qua CUNG mot chuoi lenh, ra cung mot hinh dang', async () => {
    const sales = await runScenario(testTenantScope('khach-ban-hang'), {
      point: 'order.auto_confirm',
      subjectType: 'order',
      reason: 'QUANTITY_ABOVE_THRESHOLD',
    });
    const transport = await runScenario(testTenantScope('khach-van-tai'), {
      point: 'trip_expense.record',
      subjectType: 'trip',
      reason: 'EXPENSE_PERIOD_FROZEN',
    });

    // Khong phai "ca hai deu chay duoc" — ma la ca hai cho ra CUNG MOT ket qua.
    expect(sales).toEqual(transport);
    expect(sales).toEqual({
      replayed: true,
      timelineLength: 3,
      statuses: ['CORRECTED', 'RECORDED', 'RECORDED'],
      outcomes: ['denied', 'denied', 'allowed'],
    });
  });

  it('mot khach khong nhin thay gi cua khach kia', async () => {
    const sales = testTenantScope('khach-ban-hang');
    const transport = testTenantScope('khach-van-tai');
    await runScenario(sales, { point: 'p', subjectType: 'order', reason: 'R' });

    expect(await ledger.timelineForSubject(transport, 'order', 'subject_1')).toEqual([]);
    expect(await ledger.timelineForSubject(sales, 'order', 'subject_1')).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ *
 * C2 — trung tinh o TANG CODE
 * ------------------------------------------------------------------ */

const BASE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** Tep cua tang nen: khong tinh `.spec.ts` va khong tinh `proofs/`. */
const baseFiles = readdirSync(BASE_DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(`${BASE_DIR}/${name}`, 'utf8') }));

/**
 * Boc chu thich ra.
 *
 * Ranh gioi co y nam o day: mot chu thich duoc phep ke lai vi sao tang nay ra doi — ke ca khi cau
 * chuyen do co ten mot khach that. Cai KHONG duoc phep la mot dong CODE biet ten khach.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('C2 — code cua tang nen khong biet ten khach nao', () => {
  it.each(['ultty', 'amico', 'wata', 'van-tai-viet', 'van tai viet'])(
    'khong dong code nao nhac slug "%s"',
    (slug) => {
      for (const file of baseFiles) {
        expect(stripComments(file.source).toLowerCase()).not.toContain(slug);
      }
    },
  );

  // Thuat ngu cua MOT vertical. Neu mot trong nhung tu nay xuat hien trong code cua tang nen, thi
  // tang nen da muon ngon ngu cua mot mien — va khach o mien kia se phai doc no.
  it.each(['dealer', 'zalo', 'kiotviet', 'vehicle', 'driver', 'invoice', 'sku'])(
    'khong dong code nao nhac thuat ngu vertical "%s"',
    (term) => {
      for (const file of baseFiles) {
        expect(stripComments(file.source).toLowerCase()).not.toContain(term);
      }
    },
  );

  it('co that su doc duoc tep — chan bai test rong', () => {
    expect(baseFiles.length).toBeGreaterThanOrEqual(8);
    expect(baseFiles.some((file) => file.name === 'decision-ledger.service.ts')).toBe(true);
    // Doi chung: sau khi boc chu thich thi CODE van con, khong phai boc sach thanh chuoi rong.
    for (const file of baseFiles) {
      expect(stripComments(file.source)).toMatch(/export/);
    }
  });
});
