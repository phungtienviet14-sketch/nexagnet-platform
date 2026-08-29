import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from '../source-registry/in-memory-source-registry.repository.js';
import { SourceReadinessService } from '../source-registry/source-readiness.service.js';
import { SourceRegistryService } from '../source-registry/source-registry.service.js';
import { testTenantScope } from '../source-registry/tenant-scope.js';
import {
  canUseFact,
  getEffectiveFact,
  getFactHistory,
  getSource,
  listConflicts,
  listSources,
} from './source-registry.tools.js';

const ALPHA = testTenantScope('mcp-alpha');
const BRAVO = testTenantScope('mcp-bravo');

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

async function seed(classification: 'INTERNAL' | 'PII') {
  const source = await registry.registerSource(ALPHA, {
    sourceKey: 'k',
    title: 'Tai lieu',
    kind: 'doc',
    version: 'v1',
    origin: 'CUSTOMER_SIGNED',
    authority: 'L1_CONTRACTUAL',
    classification,
    locator: 'vault://alpha/k',
    contentHash: 'a'.repeat(64),
  });
  await registry.transitionSource(ALPHA, source.id, 'REVIEWED');
  await registry.approveSource(ALPHA, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-duyet',
    evidenceRef: 'dan-chung',
  });
  await registry.makeSourceEffective(ALPHA, source.id, new Date('2026-01-01T00:00:00Z'));

  const fact = await registry.submitFact(ALPHA, {
    domain: 'd',
    key: 'k',
    value: { so: 42 },
    sourceId: source.id,
    classification,
  });
  await registry.confirmFact(ALPHA, fact.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-duyet',
    evidenceRef: 'dan-chung',
  });
  return { source, fact };
}

describe('tool doc — hinh dang tra ve', () => {
  it('list_sources / get_source tra metadata, KHONG tra locator', async () => {
    const { source } = await seed('INTERNAL');

    const listed = await listSources(registry, ALPHA, {});
    expect(listed.ok).toBe(true);
    expect(JSON.stringify(listed)).not.toContain('vault://');

    const one = await getSource(registry, ALPHA, { sourceId: source.id });
    expect(one).toMatchObject({ ok: true });
    expect(JSON.stringify(one)).not.toContain('vault://');
    // Hash VAN tra — do la thu de doi chieu, va no khong dan ai toi byte.
    expect(JSON.stringify(one)).toContain('a'.repeat(64));
  });

  it('loc theo status hoat dong', async () => {
    await seed('INTERNAL');
    const effective = await listSources(registry, ALPHA, { status: 'EFFECTIVE' });
    const received = await listSources(registry, ALPHA, { status: 'RECEIVED' });
    expect((effective as { count: number }).count).toBe(1);
    expect((received as { count: number }).count).toBe(0);
  });

  it('dau vao sai tra loi CO CAU TRUC, khong nem', async () => {
    const bad = await getSource(registry, ALPHA, { sourceId: '  ' });
    expect(bad.ok).toBe(false);
    expect((bad as { error: string }).error).toContain('sourceId');
  });
});

// PHAN LOAI PHAI CHAN GIA TRI RA KHOI HOI THOAI. Mot cau tra loi cua agent la mot chuoi se duoc
// luu lai o dau do — nen day la cung mot quy tac voi telemetry, va vi cung mot ly do.
describe('phan loai chan gia tri ra khoi cau tra loi cua agent', () => {
  it('INTERNAL thi tra gia tri', async () => {
    await seed('INTERNAL');
    const result = await getEffectiveFact(readiness, ALPHA, { domain: 'd', key: 'k' });
    expect(result).toMatchObject({ ok: true, fact: { value: { so: 42 } } });
  });

  it('PII thi GIU LAI gia tri, nhung van noi duoc co su that va o trang thai nao', async () => {
    await seed('PII');
    const result = (await getEffectiveFact(readiness, ALPHA, { domain: 'd', key: 'k' })) as {
      fact: { value: unknown; valueWithheld?: string; status: string; classification: string };
    };
    expect(result.fact.value).toBeNull();
    expect(result.fact.valueWithheld).toBe('classification');
    // Agent van lam viec duoc: no biet co su that, biet da xac nhan, biet vi sao khong doc duoc.
    expect(result.fact.status).toBe('CONFIRMED');
    expect(result.fact.classification).toBe('PII');
    // Khang dinh vao chinh gia tri chu khong quet ca chuoi JSON: id sinh ngau nhien co the tinh
    // co chua "42", va mot bai test do vi id thi la mot bai test mong manh, khong phai mot bai
    // test chat che.
    expect(JSON.stringify(result)).not.toContain('"so"');
  });

  it('lich su cung ap dung quy tac do', async () => {
    await seed('PII');
    const result = await getFactHistory(readiness, ALPHA, { domain: 'd', key: 'k' });
    expect(JSON.stringify(result)).not.toContain('"so"');
  });
});

describe('can_use_fact — tra ma ly do de agent giai thich duoc', () => {
  it('xung dot dang mo -> tu choi kem ma', async () => {
    const { source } = await seed('INTERNAL');
    const rival = await registry.submitFact(ALPHA, {
      domain: 'd',
      key: 'k',
      value: { so: 43 },
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    await registry.confirmFact(ALPHA, rival.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'nguoi-duyet',
      evidenceRef: 'dan-chung',
    });
    const facts = await repository.listFactHistory(ALPHA, 'd', 'k');
    await registry.openConflict(ALPHA, {
      conflictKey: 'C1',
      domain: 'd',
      subjectKey: 'k',
      summary: 'hai ban',
      factIds: facts.map((row) => row.id),
    });

    const result = await canUseFact(readiness, ALPHA, {
      domain: 'd',
      key: 'k',
      required: 'CONFIRMED_ONLY',
    });
    expect(result).toMatchObject({
      ok: true,
      allowed: false,
      reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT',
    });
  });

  it('list_conflicts hien goi y de agent giai thich — nhung xung dot van OPEN', async () => {
    const { source } = await seed('INTERNAL');
    const rival = await registry.submitFact(ALPHA, {
      domain: 'd',
      key: 'k',
      value: { so: 43 },
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    await registry.confirmFact(ALPHA, rival.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'nguoi-duyet',
      evidenceRef: 'dan-chung',
    });
    const facts = await repository.listFactHistory(ALPHA, 'd', 'k');
    await registry.openConflict(ALPHA, {
      conflictKey: 'C1',
      domain: 'd',
      summary: 'hai ban',
      factIds: facts.map((row) => row.id),
      recommendedFactId: facts[0]?.id ?? null,
      recommendationReason: 'ban dau co chu ky',
    });

    const result = (await listConflicts(registry, ALPHA)) as {
      openCount: number;
      conflicts: { status: string; recommendedFactId: string | null }[];
    };
    expect(result.openCount).toBe(1);
    expect(result.conflicts[0]?.recommendedFactId).toBeTruthy();
    expect(result.conflicts[0]?.status).toBe('OPEN');
  });
});

// Pham vi khach den tu THAM SO TIEM VAO, khong tu doi so cua tool — nen khong co cach nao goi mot
// tool de doc du lieu khach khac, ke ca khi biet chinh xac id.
describe('pham vi khach khong dat duoc tu doi so tool', () => {
  it('goi bang pham vi khac thi khong thay gi', async () => {
    const { source } = await seed('INTERNAL');

    expect(await getSource(registry, BRAVO, { sourceId: source.id })).toMatchObject({ ok: false });
    expect(await listSources(registry, BRAVO, {})).toMatchObject({ count: 0 });
    expect(await getEffectiveFact(readiness, BRAVO, { domain: 'd', key: 'k' })).toMatchObject({
      fact: null,
    });
    expect(await listConflicts(registry, BRAVO)).toMatchObject({ openCount: 0 });
  });
});
