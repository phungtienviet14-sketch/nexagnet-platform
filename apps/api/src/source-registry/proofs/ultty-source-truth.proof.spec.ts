import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from '../in-memory-source-registry.repository.js';
import { SourceReadinessService } from '../source-readiness.service.js';
import { SourceRegistryService } from '../source-registry.service.js';
import { testTenantScope } from '../tenant-scope.js';

/**
 * BAN CHUNG MINH A — mien BAN HANG, dung API CHUNG.
 *
 * Bon that bai co that o Ultty duoc dien dat lai bang dung nhung ham ma mot khach van tai cung
 * goi. Tep nay khong duoc chua mot ham rieng nao cho ban hang; neu no can mot ham rieng thi API
 * chung da that bai.
 *
 * SO LIEU LA TONG HOP. Gia o day khong phai gia that cua khach — hop dong nhiem vu khong doi gia
 * that, va mot ban chung minh khong duoc doi hoi du lieu mat de chay duoc. Cai duoc chung minh la
 * HINH DANG cua van de, khong phai con so.
 *
 * `T7`/`T8` = ban cong bo gia ky truoc / ky sau. Tren ho so that chung la
 * `SRC-PRICE-07` va `SRC-PRICE-08`.
 */

const ULTTY = testTenantScope('ultty');

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

const PRICE_KEY = 'sku.DEMO-01.wholesale';

/** Dua mot ban cong bo gia di het duong toi `EFFECTIVE`. */
async function publishedPriceSource(version: string, hash: string, effectiveFrom: Date) {
  const source = await registry.registerSource(ULTTY, {
    sourceKey: 'thong-bao-gia',
    title: `Thong bao gia ${version}`,
    kind: 'price_announcement',
    version,
    origin: 'CUSTOMER_SIGNED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'BUSINESS_SENSITIVE',
    locator: `vault://ultty/thong-bao-gia-${version}.pdf`,
    contentHash: hash,
    receivedAt: effectiveFrom,
  });
  await registry.transitionSource(ULTTY, source.id, 'NORMALIZED');
  await registry.transitionSource(ULTTY, source.id, 'REVIEWED');
  await registry.approveSource(ULTTY, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'sale-lead',
    evidenceRef: `cong-bo-${version}`,
  });
  return registry.makeSourceEffective(ULTTY, source.id, effectiveFrom);
}

const T7_AT = new Date('2026-07-01T00:00:00Z');
const T8_AT = new Date('2026-08-18T00:00:00Z');

describe('A1 — troi phien ban nguon: T8 thay the T7, T7 van con lich su', () => {
  it('T7 co hieu luc, T8 thay the, ca hai deu doc duoc', async () => {
    const t7 = await publishedPriceSource('T7', '7'.repeat(64), T7_AT);
    expect(t7.status).toBe('EFFECTIVE');

    const factT7 = await registry.submitFact(ULTTY, {
      domain: 'pricing',
      key: PRICE_KEY,
      value: { amount: 1_000_000, currency: 'VND' },
      sourceId: t7.id,
      classification: 'BUSINESS_SENSITIVE',
      sourceLocus: 'trang 2, dong 4',
      effectiveFrom: T7_AT,
    });
    await registry.confirmFact(ULTTY, factT7.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'cong-bo-T7',
    });

    // Ky sau: mot BAN KHAC — cung `sourceKey`, khac hash. Ten tep khong phai danh tinh.
    const t8 = await registry.registerSource(ULTTY, {
      sourceKey: 'thong-bao-gia',
      title: 'Thong bao gia T8',
      kind: 'price_announcement',
      version: 'T8',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      locator: 'vault://ultty/thong-bao-gia-T8.pdf',
      contentHash: '8'.repeat(64),
      receivedAt: T8_AT,
    });
    expect(t8.id).not.toBe(t7.id);

    await registry.transitionSource(ULTTY, t8.id, 'REVIEWED');
    await registry.approveSource(ULTTY, t8.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'cong-bo-T8',
    });
    const superseded = await registry.supersedeSource(ULTTY, {
      previousSourceId: t7.id,
      nextSourceId: t8.id,
      effectiveFrom: T8_AT,
    });

    // T8 co hieu luc; T7 chuyen lich su NHUNG van doc duoc va van biet no bi ai thay.
    expect(superseded.next.status).toBe('EFFECTIVE');
    expect(superseded.previous.status).toBe('SUPERSEDED');
    expect(superseded.previous.effectiveTo).toEqual(T8_AT);
    expect(superseded.next.supersedesId).toBe(t7.id);
    expect(await registry.findSourceById(ULTTY, t7.id)).not.toBeNull();

    // Su that theo sau nguon: ban T8 thay ban T7 tai cung dia chi.
    const factT8 = await registry.submitFact(ULTTY, {
      domain: 'pricing',
      key: PRICE_KEY,
      value: { amount: 900_000, currency: 'VND' },
      sourceId: t8.id,
      classification: 'BUSINESS_SENSITIVE',
      effectiveFrom: T8_AT,
    });
    await registry.confirmFact(ULTTY, factT8.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'cong-bo-T8',
    });
    await registry.supersedeFact(ULTTY, {
      previousFactId: factT7.id,
      nextFactId: factT8.id,
      at: T8_AT,
    });

    const current = await readiness.getEffectiveFact(ULTTY, 'pricing', PRICE_KEY, T8_AT);
    expect(current?.id).toBe(factT8.id);

    // LICH SU GIU CA HAI — day la thu ma mot cot `source` dang chuoi khong lam duoc.
    const history = await readiness.getFactHistory(ULTTY, 'pricing', PRICE_KEY);
    expect(history.map((row) => row.status)).toEqual(['SUPERSEDED', 'CONFIRMED']);
    expect(history[0]?.id).toBe(factT7.id);
  });
});

describe('A2 — ban sao noi bo de test khong tro thanh ban khach xac nhan', () => {
  it('nguon INTERNAL_TEST bi tu choi o muc CUSTOMER_CONFIRMED, va nhan do di theo no', async () => {
    const testCopy = await registry.registerSource(ULTTY, {
      sourceKey: 'bang-gia-ban-test',
      title: 'Ban sao noi bo dung de chay thu',
      kind: 'price_announcement',
      version: 'test-1',
      origin: 'INTERNAL_TEST',
      authority: 'L5_DERIVED',
      classification: 'INTERNAL',
      locator: 'vault://ultty/ban-test.xlsx',
      contentHash: '1'.repeat(64),
    });
    await registry.transitionSource(ULTTY, testCopy.id, 'REVIEWED');

    await expect(
      registry.approveSource(ULTTY, testCopy.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'ky-su',
        evidenceRef: 'chay-thu-nghiem',
      }),
    ).rejects.toMatchObject({ reason: 'APPROVAL_ORIGIN_NOT_CUSTOMER' });

    // Van dung duoc de chay thu — no bi cam DOI VAI, khong bi cam ton tai.
    await registry.approveSource(ULTTY, testCopy.id, {
      level: 'INTERNAL_ACCEPTED',
      actor: 'ky-su',
      evidenceRef: 'ticket-chay-thu',
    });
    await registry.makeSourceEffective(ULTTY, testCopy.id, T7_AT);

    const fact = await registry.submitFact(ULTTY, {
      domain: 'pricing',
      key: 'sku.DEMO-TEST.wholesale',
      value: { amount: 1, currency: 'VND' },
      sourceId: testCopy.id,
      classification: 'INTERNAL',
    });

    // Va su that suy ra tu no cung khong dong dau khach duoc.
    await expect(
      registry.confirmFact(ULTTY, fact.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'ky-su',
        evidenceRef: 'chay-thu-nghiem',
      }),
    ).rejects.toMatchObject({ reason: 'APPROVAL_ORIGIN_NOT_CUSTOMER' });
  });
});

describe('A3 — hai nguon noi khac nhau: xung dot MO, khong ai tu thang', () => {
  it('nguong so luong 50: hai nguon canh tranh -> OPEN, runtime dung lai', async () => {
    // Hai nguon THAT su khac nhau, va co y CUNG NGAY nhan — de khong con cho nao de "ngay moi hon
    // thang". Tren ho so that day la `CONFLICT-ORDER-THRESHOLD-001`.
    const sameDay = new Date('2026-08-18T00:00:00Z');
    const contract = await publishedPriceSource('phu-luc', 'a'.repeat(64), sameDay);
    const internalProcess = await registry.registerSource(ULTTY, {
      sourceKey: 'quy-trinh-bao-gia',
      title: 'Quy trinh bao gia noi bo',
      kind: 'internal_process',
      version: 'v1',
      origin: 'CUSTOMER_PROVIDED',
      authority: 'L3_CUSTOMER_INTERNAL',
      classification: 'BUSINESS_SENSITIVE',
      locator: 'vault://ultty/qt-bao-gia.pdf',
      contentHash: 'b'.repeat(64),
      receivedAt: sameDay,
    });
    await registry.transitionSource(ULTTY, internalProcess.id, 'REVIEWED');
    await registry.approveSource(ULTTY, internalProcess.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'sale-lead',
      evidenceRef: 'qt-noi-bo',
    });
    await registry.makeSourceEffective(ULTTY, internalProcess.id, sameDay);

    const THRESHOLD = 'order.auto_confirm.max_quantity';
    const inclusive = await registry.submitFact(ULTTY, {
      domain: 'order_policy',
      key: THRESHOLD,
      value: { max: 50, comparison: 'lte' },
      sourceId: contract.id,
      classification: 'INTERNAL',
    });
    const exclusive = await registry.submitFact(ULTTY, {
      domain: 'order_policy',
      key: THRESHOLD,
      value: { max: 50, comparison: 'lt' },
      sourceId: internalProcess.id,
      classification: 'INTERNAL',
    });
    for (const fact of [inclusive, exclusive]) {
      await registry.confirmFact(ULTTY, fact.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'sale-lead',
        evidenceRef: 'doc-tu-nguon',
      });
    }

    const conflict = await registry.openConflict(ULTTY, {
      conflictKey: 'CONFLICT-ORDER-THRESHOLD-001',
      domain: 'order_policy',
      subjectKey: THRESHOLD,
      summary: 'Dung 50 san pham: mot nguon cho tu xu ly, mot nguon doi duyet',
      impact: 'BLOCKING',
      factIds: [inclusive.id, exclusive.id],
      recommendedFactId: inclusive.id,
      recommendationReason: 'Ba nguon doc lap noi "tu 50 tro xuong tu xu ly"',
    });

    expect(conflict.status).toBe('OPEN');
    expect(await readiness.getBlockingConflicts(ULTTY)).toHaveLength(1);

    // GOI Y DA CO, VA VAN KHONG DONG DUOC XUNG DOT. Day la trong tam cua ban chung minh nay.
    expect(conflict.recommendedFactId).toBe(inclusive.id);
    await expect(
      readiness.canUseFact(ULTTY, 'order_policy', THRESHOLD, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
  });
});

describe('A4 — gia dinh lam viec van phan biet duoc voi su that cua khach', () => {
  it('ASM-03 (gia rieng ap cho moi so luong) chay duoc, nhung khong bao gio doi vai', async () => {
    const dealerTable = await publishedPriceSource('bang-rieng', 'c'.repeat(64), T8_AT);
    const KEY = 'dealer_override.min_quantity';

    const fact = await registry.submitFact(ULTTY, {
      domain: 'pricing',
      key: KEY,
      value: { minQuantity: 1 },
      sourceId: dealerTable.id,
      classification: 'BUSINESS_SENSITIVE',
    });

    // Bon truong bat buoc — doc thang tu `ASM-03` tren ho so that.
    const assumed = await registry.markWorkingAssumption(ULTTY, fact.id, {
      rationale:
        'Bang nguon khong co chieu so luong: moi o mot gia duy nhat, khong cot nguong, khong thang.',
      risk: 'Neu that su co nguong thi don so luong nho se duoc huong gia sai — rui ro nghiep vu that.',
      reversibility: 'Nhap nguong vao du lieu gia rieng. Khong sua mot dong code nao.',
      owner: 'product-owner',
    });

    expect(assumed.status).toBe('WORKING_ASSUMPTION');
    expect(assumed.assumptionReversibility).toContain('Khong sua');

    // Chay duoc cho viec chap nhan gia dinh...
    await expect(
      readiness.canUseFact(ULTTY, 'pricing', KEY, 'ASSUMPTION_ALLOWED'),
    ).resolves.toMatchObject({ allowed: true });

    // ...va KHONG chay cho viec doi su that cua khach. Hai cau tra loi khac nhau cho cung mot o
    // du lieu — do la ca ly do trang thai nay ton tai.
    await expect(
      readiness.canUseFact(ULTTY, 'pricing', KEY, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_IS_WORKING_ASSUMPTION' });

    // Va khong co duong nao nang no len bang mot lan duyet noi bo.
    await expect(
      registry.confirmFact(ULTTY, fact.id, {
        level: 'INTERNAL_ACCEPTED',
        actor: 'ky-su',
        evidenceRef: 'da-chay-on-dinh-mot-thang',
      }),
    ).rejects.toMatchObject({ reason: 'FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION' });

    // Khach tra loi thi no thanh su that — va day la duong DUY NHAT.
    const confirmed = await registry.confirmFact(ULTTY, fact.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'product-owner',
      evidenceRef: 'mail khach tra loi 29/08/2026',
    });
    expect(confirmed.status).toBe('CONFIRMED');
    await expect(
      readiness.canUseFact(ULTTY, 'pricing', KEY, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe('A5 — su that bat buoc con thieu thi chan nang luc', () => {
  it('nang luc ban hang bi chan khi chua co nguong da xac nhan', async () => {
    await registry.declareRequiredFact(ULTTY, {
      capability: 'sales-order',
      domain: 'order_policy',
      key: 'order.auto_confirm.max_quantity',
      requiresConfirmed: true,
      note: 'Khong co nguong da xac nhan thi khong duoc tu gui xac nhan don',
    });

    const missing = await readiness.getMissingRequiredFacts(ULTTY, 'sales-order');
    expect(missing).toEqual([
      {
        capability: 'sales-order',
        domain: 'order_policy',
        key: 'order.auto_confirm.max_quantity',
        reason: 'FACT_NOT_APPROVED',
      },
    ]);
  });
});
