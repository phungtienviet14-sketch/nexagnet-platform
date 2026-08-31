import { readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from '../in-memory-source-registry.repository.js';
import { SourceReadinessService } from '../source-readiness.service.js';
import { SourceRegistryService } from '../source-registry.service.js';
import { testTenantScope, type TenantScope } from '../tenant-scope.js';

/**
 * BAN CHUNG MINH C — DUNG MOT API cho hai vertical.
 *
 * Hai ban chung minh A va B doc rieng thi moi ban chi noi duoc "mien cua toi chay duoc". Tep nay
 * noi cai con lai, va la cai that su quan trong: chung chay bang CUNG MOT thu.
 *
 * Hai bai duoi tan cong tu hai phia:
 *   1. HANH VI — cung mot chuoi lenh, chay cho mot khach ban hang va mot khach van tai, cho ra
 *      cung mot hinh dang ket qua. Tham so khac nhau; duong di khong.
 *   2. CAU TRUC — code cua tang nen KHONG chua ten khach nao va khong chua thuat ngu cua mot
 *      vertical nao. Bai nay boc chu thich ra truoc khi kiem: mot chu thich ke lai vi sao tang nay
 *      ra doi thi duoc phep nhac mot su viec co that, con MOT DONG CODE re theo ten khach thi
 *      khong.
 */

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

/**
 * MOT kich ban duy nhat: dang ky nguon -> duyet -> hieu luc -> hai su that canh tranh -> xung dot.
 * Khong mot tham so nao trong day noi ve "loai khach"; chung chi la chuoi va so.
 */
async function runScenario(
  scope: TenantScope,
  input: { readonly kind: string; readonly domain: string; readonly key: string },
) {
  const source = await registry.registerSource(scope, {
    sourceKey: 'nguon-chinh',
    title: 'Tai lieu nguon',
    kind: input.kind,
    version: 'v1',
    origin: 'CUSTOMER_PROVIDED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'BUSINESS_SENSITIVE',
    locator: `vault://${scope.tenantId}/nguon-chinh-v1`,
    contentHash: '0'.repeat(63) + '1',
  });
  await registry.transitionSource(scope, source.id, 'REVIEWED');
  await registry.approveSource(scope, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-co-tham-quyen',
    evidenceRef: 'dan-chung',
  });
  await registry.makeSourceEffective(scope, source.id, new Date('2026-01-01T00:00:00Z'));

  const first = await registry.submitFact(scope, {
    domain: input.domain,
    key: input.key,
    value: { variant: 'A' },
    sourceId: source.id,
    classification: 'BUSINESS_SENSITIVE',
  });
  const second = await registry.submitFact(scope, {
    domain: input.domain,
    key: input.key,
    value: { variant: 'B' },
    sourceId: source.id,
    classification: 'BUSINESS_SENSITIVE',
  });
  for (const fact of [first, second]) {
    await registry.confirmFact(scope, fact.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'nguoi-co-tham-quyen',
      evidenceRef: 'doc-tu-nguon',
    });
  }

  const conflict = await registry.openConflict(scope, {
    conflictKey: 'XUNG-DOT-01',
    domain: input.domain,
    subjectKey: input.key,
    summary: 'Hai ban doc khac nhau',
    factIds: [first.id, second.id],
  });

  const verdict = await readiness.canUseFact(scope, input.domain, input.key, 'CONFIRMED_ONLY');
  return {
    sourceStatus: source.status,
    conflictStatus: conflict.status,
    blocking: (await readiness.getBlockingConflicts(scope)).length,
    verdictReason: verdict.reason,
    historyLength: (await readiness.getFactHistory(scope, input.domain, input.key)).length,
  };
}

describe('C1 — hai vertical, mot API', () => {
  it('khach ban hang va khach van tai di qua CUNG mot chuoi lenh, ra cung mot hinh dang', async () => {
    const sales = await runScenario(testTenantScope('khach-ban-hang'), {
      kind: 'price_announcement',
      domain: 'pricing',
      key: 'sku.DEMO.wholesale',
    });
    const transport = await runScenario(testTenantScope('khach-van-tai'), {
      kind: 'business_analysis',
      domain: 'reconciliation',
      key: 'mismatch.handling',
    });

    // Khong phai "ca hai deu chay duoc" — ma la ca hai cho ra CUNG MOT ket qua.
    expect(sales).toEqual(transport);
    expect(sales).toEqual({
      sourceStatus: 'RECEIVED',
      conflictStatus: 'OPEN',
      blocking: 1,
      verdictReason: 'FACT_BLOCKED_BY_OPEN_CONFLICT',
      historyLength: 2,
    });
  });

  it('mot khach khong nhin thay gi cua khach kia', async () => {
    const sales = testTenantScope('khach-ban-hang');
    const transport = testTenantScope('khach-van-tai');
    await runScenario(sales, { kind: 'k', domain: 'pricing', key: 'a' });

    expect(await registry.listSources(transport)).toEqual([]);
    expect(await readiness.getBlockingConflicts(transport)).toEqual([]);
    expect(await registry.listSources(sales)).toHaveLength(1);
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
 * Ranh gioi co y nam o day: mot chu thich duoc phep ke lai vi sao tang nay ra doi — ke ca khi
 * cau chuyen do co ten mot khach that, va ca repo nay dang lam nhu vay. Cai KHONG duoc phep la
 * mot dong CODE biet ten khach. Bai duoi kiem dung phan con lai sau khi boc chu thich.
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
    expect(baseFiles.some((file) => file.name === 'source-registry.service.ts')).toBe(true);
    // Doi chung: sau khi boc chu thich thi CODE van con, khong phai boc sach thanh chuoi rong.
    for (const file of baseFiles) {
      expect(stripComments(file.source)).toMatch(/export/);
    }
  });
});
