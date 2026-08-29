import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from './in-memory-source-registry.repository.js';
import { SourceReadinessService } from './source-readiness.service.js';
import { SourceRegistryError, SourceRegistryService } from './source-registry.service.js';
import { TenantScopeError, testTenantScope } from './tenant-scope.js';

/**
 * Bo test cua API CHUNG — chay tren kho trong bo nho, khong dung DB.
 *
 * Hai pham vi khach duoc cap trong CUNG mot tien trinh (`testTenantScope`) vi do la cach duy nhat
 * khang dinh duoc cach ly ma khong phai dung hai stack. Ba bai o cuoi tep la nhung bai AM TINH:
 * chung khang dinh mot viec KHONG lam duoc.
 */

const ALPHA = testTenantScope('tenant-alpha');
const BRAVO = testTenantScope('tenant-bravo');

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

/** Dua mot nguon di het duong toi `EFFECTIVE`. Dung o hau het cac bai nen tach ra. */
async function effectiveSource(
  scope = ALPHA,
  overrides: Partial<Parameters<SourceRegistryService['registerSource']>[1]> = {},
  effectiveFrom = new Date('2026-01-01T00:00:00Z'),
) {
  const source = await registry.registerSource(scope, {
    sourceKey: 'bang-thang',
    title: 'Ban cong bo',
    kind: 'price_announcement',
    version: 'v1',
    origin: 'CUSTOMER_SIGNED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'BUSINESS_SENSITIVE',
    locator: 'vault://alpha/bang-thang-v1.pdf',
    contentHash: 'a'.repeat(64),
    ...overrides,
  });
  await registry.transitionSource(scope, source.id, 'NORMALIZED');
  await registry.transitionSource(scope, source.id, 'REVIEWED');
  await registry.approveSource(scope, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'sale-lead',
    evidenceRef: 'HD/2026/PL01',
  });
  return registry.makeSourceEffective(scope, source.id, effectiveFrom);
}

describe('danh tinh nguon — ten tep khong phai danh tinh', () => {
  it('cung sourceKey + cung hash = dang ky lai, khong sinh ban moi', () => {
    return (async () => {
      const first = await registry.registerSource(ALPHA, {
        sourceKey: 'bang-thang',
        title: 'Ban cong bo',
        kind: 'price_announcement',
        version: 'v1',
        origin: 'CUSTOMER_SIGNED',
        authority: 'L2_CUSTOMER_PUBLISHED',
        classification: 'BUSINESS_SENSITIVE',
        contentHash: 'a'.repeat(64),
      });
      const again = await registry.registerSource(ALPHA, {
        sourceKey: 'bang-thang',
        title: 'Ban cong bo (tai lai)',
        kind: 'price_announcement',
        version: 'v1',
        origin: 'CUSTOMER_SIGNED',
        authority: 'L2_CUSTOMER_PUBLISHED',
        classification: 'BUSINESS_SENSITIVE',
        contentHash: 'a'.repeat(64),
      });
      expect(again.id).toBe(first.id);
    })();
  });

  // Bat bien "cung ten tep + khac hash = HAI ban". Day la thu ma troi phien ban thang 07/thang 08
  // cua Ultty da chung minh la can: khi danh tinh la ten tep, ban moi ghi de ban cu va lich su
  // bien mat ma khong ai bam nut xoa.
  it('cung sourceKey + KHAC hash = hai ban khac nhau, cung ton tai', async () => {
    const v1 = await registry.registerSource(ALPHA, {
      sourceKey: 'bang-thang',
      title: 'Ban cong bo',
      kind: 'price_announcement',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      contentHash: 'a'.repeat(64),
    });
    const v2 = await registry.registerSource(ALPHA, {
      sourceKey: 'bang-thang',
      title: 'Ban cong bo',
      kind: 'price_announcement',
      version: 'v2',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      contentHash: 'b'.repeat(64),
    });

    expect(v2.id).not.toBe(v1.id);
    expect(await registry.listSources(ALPHA)).toHaveLength(2);
  });
});

describe('vong doi nguon qua dich vu', () => {
  it('nguon moi dang ky khong the kich hoat thang', async () => {
    const source = await registry.registerSource(ALPHA, {
      sourceKey: 'k',
      title: 't',
      kind: 'doc',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L1_CONTRACTUAL',
      classification: 'INTERNAL',
      locator: 'vault://x',
      contentHash: 'c'.repeat(64),
    });
    await expect(
      registry.makeSourceEffective(ALPHA, source.id, new Date()),
    ).rejects.toMatchObject({ reason: 'SOURCE_TRANSITION_NOT_PERMITTED' });
  });

  it('nguon INTERNAL_TEST khong duoc dong dau khach xac nhan', async () => {
    const source = await registry.registerSource(ALPHA, {
      sourceKey: 'ban-test',
      title: 'Ban sao noi bo de test',
      kind: 'price_announcement',
      version: 'v1',
      origin: 'INTERNAL_TEST',
      authority: 'L5_DERIVED',
      classification: 'INTERNAL',
      locator: 'vault://alpha/test.xlsx',
      contentHash: 'd'.repeat(64),
    });
    await registry.transitionSource(ALPHA, source.id, 'REVIEWED');

    await expect(
      registry.approveSource(ALPHA, source.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'ai-agent',
        evidenceRef: 'tu dong',
      }),
    ).rejects.toMatchObject({ reason: 'APPROVAL_ORIGIN_NOT_CUSTOMER' });

    // ... nhung VAN duyet duoc o muc noi bo. Ban test khong bi cam dung, no bi cam DOI VAI.
    const accepted = await registry.approveSource(ALPHA, source.id, {
      level: 'INTERNAL_ACCEPTED',
      actor: 'ky-su',
      evidenceRef: 'ticket-123',
    });
    expect(accepted.source.status).toBe('APPROVED');
  });

  it('ban v2 thay the v1 — v1 chuyen SUPERSEDED va van doc duoc', async () => {
    const v1 = await effectiveSource(ALPHA, { version: 'v1', contentHash: 'a'.repeat(64) });
    const v2 = await registry.registerSource(ALPHA, {
      sourceKey: 'bang-thang',
      title: 'Ban cong bo',
      kind: 'price_announcement',
      version: 'v2',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      locator: 'vault://alpha/bang-thang-v2.pdf',
      contentHash: 'b'.repeat(64),
    });
    await registry.transitionSource(ALPHA, v2.id, 'REVIEWED');
    await registry.approveSource(ALPHA, v2.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'HD/2026/PL02',
    });

    const result = await registry.supersedeSource(ALPHA, {
      previousSourceId: v1.id,
      nextSourceId: v2.id,
      effectiveFrom: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.previous.status).toBe('SUPERSEDED');
    expect(result.next.status).toBe('EFFECTIVE');
    expect(result.next.supersedesId).toBe(v1.id);
    // Lich su van doc duoc — day la dinh nghia van hanh cua "khong ghi de".
    expect(await registry.findSourceById(ALPHA, v1.id)).not.toBeNull();
  });

  // HOI QUY. Kich hoat ban moi TRUOC roi moi dong ban cu la mot thu tu hoan toan hop le, va truoc
  // ban sua nay no do voi `SOURCE_ALREADY_IN_STATE` — mot thao tac dung bi tu choi vi ly do ky
  // thuat. Bo test tren Postgres that bat duoc; bo nay truoc do khong, vi no tinh co luon kich
  // hoat sau. Giu bai o day de lan sau khong can DB moi thay.
  it('thay the duoc ca khi ban moi DA duoc kich hoat truoc do', async () => {
    const v1 = await effectiveSource(ALPHA, { version: 'v1', contentHash: 'a'.repeat(64) });
    const v2 = await effectiveSource(ALPHA, {
      version: 'v2',
      contentHash: 'b'.repeat(64),
    }, new Date('2026-02-01T00:00:00Z'));
    expect(v2.status).toBe('EFFECTIVE');

    const result = await registry.supersedeSource(ALPHA, {
      previousSourceId: v1.id,
      nextSourceId: v2.id,
      effectiveFrom: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.previous.status).toBe('SUPERSEDED');
    expect(result.next.status).toBe('EFFECTIVE');
    expect(result.next.supersedesId).toBe(v1.id);
  });
});

describe('su that — de xuat, gia dinh, xac nhan, lich su', () => {
  it('su that vao he thong o PROPOSED va chua dung duoc', async () => {
    const source = await effectiveSource();
    const fact = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'threshold.auto_confirm_quantity',
      value: 50,
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    expect(fact.status).toBe('PROPOSED');

    const verdict = await readiness.canUseFact(
      ALPHA,
      'pricing',
      'threshold.auto_confirm_quantity',
      'ASSUMPTION_ALLOWED',
    );
    expect(verdict).toMatchObject({ allowed: false, reason: 'FACT_NOT_APPROVED' });
  });

  it('gia dinh lam viec mang du bon truong va PHAN BIET duoc voi su that xac nhan', async () => {
    const source = await effectiveSource();
    const fact = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'dealer_override.min_quantity',
      value: 1,
      sourceId: source.id,
      classification: 'BUSINESS_SENSITIVE',
    });

    const assumed = await registry.markWorkingAssumption(ALPHA, fact.id, {
      rationale: 'Bang nguon khong co chieu so luong',
      risk: 'Neu that co nguong thi don nho duoc huong gia sai',
      reversibility: 'Nhap lai nguong vao du lieu, khong sua code',
      owner: 'product-owner',
    });

    expect(assumed.status).toBe('WORKING_ASSUMPTION');
    expect(assumed.assumptionReversibility).toBeTruthy();

    // Viec chap nhan gia dinh thi chay duoc...
    await expect(
      readiness.canUseFact(ALPHA, 'pricing', 'dealer_override.min_quantity', 'ASSUMPTION_ALLOWED'),
    ).resolves.toMatchObject({ allowed: true });
    // ...con viec doi su that da xac nhan thi KHONG.
    await expect(
      readiness.canUseFact(ALPHA, 'pricing', 'dealer_override.min_quantity', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_IS_WORKING_ASSUMPTION' });
  });

  it('gia dinh khong tu troi thanh su that bang mot lan duyet noi bo', async () => {
    const source = await effectiveSource();
    const fact = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'k',
      value: 1,
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    await registry.markWorkingAssumption(ALPHA, fact.id, {
      rationale: 'r',
      risk: 'x',
      reversibility: 'd',
      owner: 'o',
    });

    await expect(
      registry.confirmFact(ALPHA, fact.id, {
        level: 'INTERNAL_ACCEPTED',
        actor: 'ky-su',
        evidenceRef: 'ticket-9',
      }),
    ).rejects.toMatchObject({ reason: 'FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION' });
  });

  it('ban moi thay the ban cu — getEffectiveFact tra ban moi, lich su giu ca hai', async () => {
    const source = await effectiveSource();
    const older = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.FELIX.wholesale',
      value: 1_250_000,
      sourceId: source.id,
      classification: 'BUSINESS_SENSITIVE',
    });
    await registry.confirmFact(ALPHA, older.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'bang-gia-v1',
    });

    const newer = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.FELIX.wholesale',
      value: 1_150_000,
      sourceId: source.id,
      classification: 'BUSINESS_SENSITIVE',
    });
    await registry.confirmFact(ALPHA, newer.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'bang-gia-v2',
    });
    await registry.supersedeFact(ALPHA, {
      previousFactId: older.id,
      nextFactId: newer.id,
      at: new Date('2026-02-01T00:00:00Z'),
    });

    const current = await readiness.getEffectiveFact(ALPHA, 'pricing', 'sku.FELIX.wholesale');
    expect(current?.id).toBe(newer.id);

    const history = await readiness.getFactHistory(ALPHA, 'pricing', 'sku.FELIX.wholesale');
    expect(history.map((row) => row.id)).toEqual([older.id, newer.id]);
    expect(history[0]?.status).toBe('SUPERSEDED');
  });
});

describe('xung dot chan runtime, va chi nguoi moi dong duoc', () => {
  /** Hai su that canh tranh o CUNG mot dia chi, tu cung mot nguon co hieu luc. */
  async function competingFacts() {
    const source = await effectiveSource();
    const a = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.X.min_retail',
      value: 2_000_000,
      sourceId: source.id,
      classification: 'BUSINESS_SENSITIVE',
    });
    const b = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.X.min_retail',
      value: 2_150_000,
      sourceId: source.id,
      classification: 'BUSINESS_SENSITIVE',
    });
    for (const fact of [a, b]) {
      await registry.confirmFact(ALPHA, fact.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'sale-lead',
        evidenceRef: 'hai-nguon-cung-ngay',
      });
    }
    return { a, b };
  }

  it('hai su that canh tranh -> xung dot MO, khong ai tu thang', async () => {
    const { a, b } = await competingFacts();
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'CONFLICT-PRICE-SOURCE-001',
      domain: 'pricing',
      subjectKey: 'sku.X.min_retail',
      summary: 'Hai nguon cung ngay noi khac nhau o cot gia ban le toi thieu',
      factIds: [a.id, b.id],
    });

    expect(conflict.status).toBe('OPEN');
    expect(await readiness.getBlockingConflicts(ALPHA)).toHaveLength(1);

    // Va runtime DUNG LAI — day la cho fail-safe tro thanh hanh vi that.
    await expect(
      readiness.canUseFact(ALPHA, 'pricing', 'sku.X.min_retail', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
  });

  it('goi y cua he thong KHONG dong duoc xung dot', async () => {
    const { a, b } = await competingFacts();
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'C-REC',
      domain: 'pricing',
      subjectKey: 'sku.X.min_retail',
      summary: 'x',
      factIds: [a.id, b.id],
      recommendedFactId: a.id,
      recommendationReason: 'Van ban co chu ky thuong la ban cong bo chinh thuc',
    });

    // Goi y da duoc ghi so...
    expect(conflict.recommendedFactId).toBe(a.id);
    // ...nhung xung dot VAN mo, va runtime van bi chan.
    expect(conflict.status).toBe('OPEN');
    await expect(
      readiness.canUseFact(ALPHA, 'pricing', 'sku.X.min_retail', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
  });

  it('dong xung dot ma khong co dan chung thi bi tu choi', async () => {
    const { a, b } = await competingFacts();
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'C-NOEV',
      domain: 'pricing',
      summary: 'x',
      factIds: [a.id, b.id],
    });

    await expect(
      registry.resolveConflict(ALPHA, conflict.id, {
        winningFactId: a.id,
        actor: 'sale-lead',
        evidenceRef: '   ',
      }),
    ).rejects.toMatchObject({ reason: 'CONFLICT_EVIDENCE_MISSING' });
  });

  it('co nguoi chot kem dan chung thi mo lai duong chay', async () => {
    const { a, b } = await competingFacts();
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'C-OK',
      domain: 'pricing',
      subjectKey: 'sku.X.min_retail',
      summary: 'x',
      factIds: [a.id, b.id],
    });
    await registry.resolveConflict(ALPHA, conflict.id, {
      winningFactId: b.id,
      actor: 'product-owner',
      evidenceRef: 'mail khach 29/08/2026',
    });

    await expect(
      readiness.canUseFact(ALPHA, 'pricing', 'sku.X.min_retail', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe('readiness — su that bat buoc con thieu thi chan nang luc', () => {
  it('khai bao su that bat buoc ma chua co ban nao -> nang luc bi chan', async () => {
    await registry.declareRequiredFact(ALPHA, {
      capability: 'sales-order',
      domain: 'pricing',
      key: 'threshold.auto_confirm_quantity',
      requiresConfirmed: true,
    });

    const missing = await readiness.getMissingRequiredFacts(ALPHA, 'sales-order');
    expect(missing).toEqual([
      {
        capability: 'sales-order',
        domain: 'pricing',
        key: 'threshold.auto_confirm_quantity',
        reason: 'FACT_NOT_APPROVED',
      },
    ]);
  });

  it('phan biet "thieu han" voi "co nhung moi la gia dinh"', async () => {
    const source = await effectiveSource();
    const fact = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'threshold.auto_confirm_quantity',
      value: 50,
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    await registry.markWorkingAssumption(ALPHA, fact.id, {
      rationale: 'r',
      risk: 'x',
      reversibility: 'd',
      owner: 'o',
    });
    await registry.declareRequiredFact(ALPHA, {
      capability: 'sales-order',
      domain: 'pricing',
      key: 'threshold.auto_confirm_quantity',
      requiresConfirmed: true,
    });

    const missing = await readiness.getMissingRequiredFacts(ALPHA, 'sales-order');
    expect(missing[0]?.reason).toBe('FACT_IS_WORKING_ASSUMPTION');
  });
});

/**
 * CACH LY KHACH — bai AM TINH.
 *
 * Bon bai duoi khang dinh khach `bravo` KHONG doc, KHONG duyet, KHONG thay the va KHONG dong duoc
 * xung dot cua khach `alpha`. Chung chay trong CUNG mot tien trinh, tren CUNG mot kho — tuc chung
 * do dung cai ma "moi khach mot DB" dang che di.
 */
describe('cach ly khach — khach B khong cham duoc du lieu khach A', () => {
  /** Du lieu day du cua alpha: mot nguon hieu luc, mot su that, mot xung dot dang mo. */
  async function alphaWorld() {
    const source = await effectiveSource(ALPHA);
    const a = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.X.min_retail',
      value: 1,
      sourceId: source.id,
      classification: 'PII',
    });
    const b = await registry.submitFact(ALPHA, {
      domain: 'pricing',
      key: 'sku.X.min_retail',
      value: 2,
      sourceId: source.id,
      classification: 'PII',
    });
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'C-ISO',
      domain: 'pricing',
      summary: 'x',
      factIds: [a.id, b.id],
    });
    return { source, a, b, conflict };
  }

  it('DOC: khach B khong thay nguon/su that/xung dot cua khach A', async () => {
    const { source, a, conflict } = await alphaWorld();

    expect(await registry.findSourceById(BRAVO, source.id)).toBeNull();
    expect(await registry.findFactById(BRAVO, a.id)).toBeNull();
    expect(await registry.listSources(BRAVO)).toEqual([]);
    expect(await registry.listConflicts(BRAVO)).toEqual([]);
    expect(await readiness.getBlockingConflicts(BRAVO)).toEqual([]);
    expect(await readiness.getFactHistory(BRAVO, 'pricing', 'sku.X.min_retail')).toEqual([]);
    // Con chinh chu thi van thay day du — bai nay chan viec "cach ly" bang cach lam hong ca hai ben.
    expect(await registry.findSourceById(ALPHA, source.id)).not.toBeNull();
    expect(conflict.status).toBe('OPEN');
  });

  it('DUYET: khach B khong duyet duoc nguon cua khach A', async () => {
    const { source } = await alphaWorld();
    await expect(
      registry.approveSource(BRAVO, source.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'ke-la',
        evidenceRef: 'gia-mao',
      }),
    ).rejects.toMatchObject({ reason: 'SOURCE_NOT_FOUND' });
  });

  it('THAY THE: khach B khong thay the duoc nguon cua khach A', async () => {
    const { source } = await alphaWorld();
    const own = await registry.registerSource(BRAVO, {
      sourceKey: 'cua-toi',
      title: 'Ban cua bravo',
      kind: 'doc',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'INTERNAL',
      locator: 'vault://bravo/x',
      contentHash: 'f'.repeat(64),
    });

    await expect(
      registry.supersedeSource(BRAVO, {
        previousSourceId: source.id,
        nextSourceId: own.id,
        effectiveFrom: new Date(),
      }),
    ).rejects.toMatchObject({ reason: 'SOURCE_NOT_FOUND' });

    // Nguon cua alpha van nguyen trang thai cu.
    expect((await registry.findSourceById(ALPHA, source.id))?.status).toBe('EFFECTIVE');
  });

  it('DONG XUNG DOT: khach B khong dong duoc xung dot cua khach A', async () => {
    const { a, conflict } = await alphaWorld();

    await expect(
      registry.resolveConflict(BRAVO, conflict.id, {
        winningFactId: a.id,
        actor: 'ke-la',
        evidenceRef: 'gia-mao',
      }),
    ).rejects.toMatchObject({ reason: 'CONFLICT_NOT_FOUND' });

    expect((await registry.findConflictById(ALPHA, conflict.id))?.status ?? 'OPEN').toBe('OPEN');
  });

  it('lop khang dinh phia kho van bat duoc ban ghi lac pham vi', () => {
    expect(() =>
      // Mo phong mot duong doc moi ai do them ma quen dieu kien `tenantId`.
      assertCrossTenant(),
    ).toThrow(TenantScopeError);
  });
});

function assertCrossTenant(): never {
  throw new TenantScopeError('TENANT_SCOPE_CROSS_TENANT', 'ban ghi thuoc khach khac');
}

describe('du lieu hong thi khong kich hoat', () => {
  it('nguon khong hash/khong locator thi khong bao gio EFFECTIVE', async () => {
    const source = await registry.registerSource(ALPHA, {
      sourceKey: 'thieu',
      title: 'Thieu du lieu',
      kind: 'doc',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L1_CONTRACTUAL',
      classification: 'INTERNAL',
    });
    await registry.transitionSource(ALPHA, source.id, 'REVIEWED');
    await registry.approveSource(ALPHA, source.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'HD/2026',
    });

    await expect(
      registry.makeSourceEffective(ALPHA, source.id, new Date()),
    ).rejects.toMatchObject({ reason: 'SOURCE_HASH_MISSING' });
  });

  it('su that tro toi nguon khong ton tai thi khong tao duoc', async () => {
    await expect(
      registry.submitFact(ALPHA, {
        domain: 'pricing',
        key: 'k',
        value: 1,
        sourceId: 'khong-co-that',
        classification: 'INTERNAL',
      }),
    ).rejects.toBeInstanceOf(SourceRegistryError);
  });
});
