import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from './in-memory-source-registry.repository.js';
import { SourceReadinessService } from './source-readiness.service.js';
import { SourceRegistryError, SourceRegistryService } from './source-registry.service.js';
import { testTenantScope } from './tenant-scope.js';

/**
 * BA BAT BIEN MA BO TEST TRUOC DE LOT — moi bai o day ung voi mot loi da co that trong code da
 * xanh 7/7 tren CI.
 *
 * 1. **Khong co ke thang im lang.** Hai su that `CONFIRMED` cung dia chi, khong ban nao thay ban
 *    nao, khong ai mo xung dot ⇒ `getEffectiveFact()` cu lay ban cuoi. Bo test cu KHONG bat duoc
 *    vi no luon goi `openConflict()` ngay sau khi xac nhan ca hai — tuc no chi do khoang thoi
 *    gian SAU khi co nguoi nhin thay, chu chua bao gio do khoang truoc do.
 * 2. **That bai khong de lai trang thai.** Mot lan duyet hong van de lai ban ghi phe duyet, va
 *    lan chuyen trang thai sau do doc thay "da co nguoi duyet".
 * 3. **Thay the phai cung dong ho.** `supersedeFact()` khong kiem `(domain, key)`, nen mot su
 *    that co the dong mot su that hoan toan khac lai.
 */

const SCOPE = testTenantScope('tenant-kiem-chung');

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

/** Dang ky mot nguon roi dua no di het duong toi `EFFECTIVE`. */
async function effectiveSource(sourceKey: string, hash: string) {
  const source = await registry.registerSource(SCOPE, {
    sourceKey,
    title: `Ban cong bo ${sourceKey}`,
    kind: 'announcement',
    version: 'v1',
    origin: 'CUSTOMER_SIGNED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'INTERNAL',
    locator: `vault://kiem-chung/${sourceKey}.pdf`,
    contentHash: hash,
  });
  await registry.transitionSource(SCOPE, source.id, 'REVIEWED');
  await registry.approveSource(SCOPE, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-co-tham-quyen',
    evidenceRef: 'HD/2026/PL01',
  });
  return registry.makeSourceEffective(SCOPE, source.id, new Date('2026-01-01T00:00:00Z'));
}

async function confirmedFact(sourceId: string, domain: string, key: string, value: unknown) {
  const fact = await registry.submitFact(SCOPE, {
    domain,
    key,
    value,
    sourceId,
    classification: 'INTERNAL',
  });
  return registry.confirmFact(SCOPE, fact.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-co-tham-quyen',
    evidenceRef: 'doc-tu-nguon',
  });
}

/** Mot nguon `RECEIVED` — chua di buoc nao, dung cho cac bai ve that bai giua chung. */
async function receivedSource(sourceKey = 'bang-gia') {
  return registry.registerSource(SCOPE, {
    sourceKey,
    title: 'Ban cong bo',
    kind: 'announcement',
    version: 'v1',
    origin: 'CUSTOMER_SIGNED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'INTERNAL',
    locator: `vault://kiem-chung/${sourceKey}.pdf`,
    contentHash: 'a'.repeat(64),
  });
}

/**
 * Kho CO CHU Y HONG o dung cau ghi thu N cua mot thao tac.
 *
 * Day la cach duy nhat do duoc "DB rot giua chung" — thu ma khong loi goi API sai nao tai hien
 * duoc, va cung la thu ban review goi ten rieng. Ke thua chu khong nhai lai: chi bon duong GHI
 * bi boc, moi thu con lai uy quyen thang cho kho that, nen bai test khong the xanh nho mot ban
 * gia sai lech.
 */
class FaultyRepository extends InMemorySourceRegistryRepository {
  private writes = 0;

  constructor(
    private readonly real: InMemorySourceRegistryRepository,
    private readonly failOnWrite: number,
  ) {
    super();
  }

  private guard(): void {
    this.writes += 1;
    if (this.writes === this.failOnWrite) throw new Error('Kho hong giua chung');
  }

  override async runInTransaction<T>(
    fn: (repository: InMemorySourceRegistryRepository) => Promise<T>,
  ): Promise<T> {
    // Giao dich do KHO THAT mo — day moi la diem cua bai test: cac cau ghi di qua lop hong nay
    // van nam trong don vi cong viec cua kho that, nen roll back phai go duoc chung.
    return this.real.runInTransaction(() => fn(this));
  }

  override async createApproval(
    ...args: Parameters<InMemorySourceRegistryRepository['createApproval']>
  ) {
    this.guard();
    return this.real.createApproval(...args);
  }

  override async updateSource(
    ...args: Parameters<InMemorySourceRegistryRepository['updateSource']>
  ) {
    this.guard();
    return this.real.updateSource(...args);
  }

  override async updateFact(...args: Parameters<InMemorySourceRegistryRepository['updateFact']>) {
    this.guard();
    return this.real.updateFact(...args);
  }

  override async createFact(...args: Parameters<InMemorySourceRegistryRepository['createFact']>) {
    this.guard();
    return this.real.createFact(...args);
  }

  override async findSourceById(
    ...args: Parameters<InMemorySourceRegistryRepository['findSourceById']>
  ) {
    return this.real.findSourceById(...args);
  }

  override async findFactById(
    ...args: Parameters<InMemorySourceRegistryRepository['findFactById']>
  ) {
    return this.real.findFactById(...args);
  }

  override async listApprovals(
    ...args: Parameters<InMemorySourceRegistryRepository['listApprovals']>
  ) {
    return this.real.listApprovals(...args);
  }

  override async listSources(...args: Parameters<InMemorySourceRegistryRepository['listSources']>) {
    return this.real.listSources(...args);
  }
}

/* ================================================================== *
 * 1 — KHONG CO KE THANG IM LANG
 * ================================================================== */

describe('hai ban cung song tai mot dia chi thi runtime DUNG, khong tu chon', () => {
  /**
   * Dung bon buoc ma ban review yeu cau: tao nguon · xac nhan A · xac nhan B tai CUNG dia chi
   * (khong thay the, khong mo xung dot) · runtime KHONG duoc tra ve A hay B.
   */
  it('A va B cung CONFIRMED tai mot dia chi, chua ai phan xu, thi khong ban nao dung duoc', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));

    const factA = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1_150_000 });
    const factB = await confirmedFact(bravo.id, 'pricing', 'ELNI.price', { amount: 1_250_000 });

    // Duong GHI co phep hai ban cung ton tai — lich su la mot so ghi, va "hai nguon noi khac
    // nhau" la mot su kien co that phai ghi lai. Duong DOC moi la cho khong duoc phep tu chon.
    expect(factA.status).toBe('CONFIRMED');
    expect(factB.status).toBe('CONFIRMED');

    await expect(readiness.getEffectiveFact(SCOPE, 'pricing', 'ELNI.price')).resolves.toBeNull();

    const verdict = await readiness.canUseFact(SCOPE, 'pricing', 'ELNI.price', 'CONFIRMED_ONLY');
    expect(verdict).toMatchObject({ allowed: false, reason: 'FACT_AMBIGUOUS_LIVE_VERSIONS' });
    // Va no khong duoc phep tra ve MOT trong hai ban nhu the do la cau tra loi.
    expect(verdict.fact).toBeNull();
  });

  // Mot mau thuan KHONG AI NHIN THAY nguy hiem hon mot mau thuan da co phieu. Bai nay khoa cai
  // nguyen ban tra loi duoc cau hoi do.
  it('dia chi nhap nhang bi liet ke ra, kem viec da co ai mo phieu hay chua', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const factA = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1_150_000 });
    const factB = await confirmedFact(bravo.id, 'pricing', 'ELNI.price', { amount: 1_250_000 });

    const ambiguous = await readiness.getAmbiguousFactAddresses(SCOPE);
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]).toMatchObject({
      domain: 'pricing',
      key: 'ELNI.price',
      hasOpenBlockingConflict: false,
    });
    expect([...(ambiguous[0]?.factIds ?? [])].sort()).toEqual([factA.id, factB.id].sort());
  });

  it('mo xung dot khong lam het nhap nhang, no chi doi ma ly do sang cai noi duoc nhieu hon', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const factA = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1_150_000 });
    const factB = await confirmedFact(bravo.id, 'pricing', 'ELNI.price', { amount: 1_250_000 });

    await registry.openConflict(SCOPE, {
      conflictKey: 'CONFLICT-ELNI-001',
      domain: 'pricing',
      subjectKey: 'ELNI.price',
      summary: 'Hai bang gia noi hai muc khac nhau cho cung mot ma',
      impact: 'BLOCKING',
      factIds: [factA.id, factB.id],
      recommendedFactId: factA.id,
      recommendationReason: 'Ban ky sau',
    });

    await expect(
      readiness.canUseFact(SCOPE, 'pricing', 'ELNI.price', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
    await expect(readiness.getEffectiveFact(SCOPE, 'pricing', 'ELNI.price')).resolves.toBeNull();
  });

  // LOI THOAT DUY NHAT: mot nguoi dong xung dot bang dan chung. Khong phai goi y, khong phai tham
  // quyen, khong phai "ban tao sau".
  it('chi mot xung dot DA DUOC NGUOI DONG moi tra lai cau tra loi duy nhat', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const factA = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1_150_000 });
    const factB = await confirmedFact(bravo.id, 'pricing', 'ELNI.price', { amount: 1_250_000 });

    const conflict = await registry.openConflict(SCOPE, {
      conflictKey: 'CONFLICT-ELNI-001',
      domain: 'pricing',
      subjectKey: 'ELNI.price',
      summary: 'Hai bang gia noi hai muc khac nhau cho cung mot ma',
      impact: 'BLOCKING',
      factIds: [factA.id, factB.id],
    });
    await registry.resolveConflict(SCOPE, conflict.id, {
      winningFactId: factB.id,
      actor: 'nguoi-chot',
      evidenceRef: 'bien-ban-2026-01-15',
    });

    await expect(
      readiness.getEffectiveFact(SCOPE, 'pricing', 'ELNI.price'),
    ).resolves.toMatchObject({ id: factB.id });
    await expect(
      readiness.canUseFact(SCOPE, 'pricing', 'ELNI.price', 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: true, reason: 'FACT_USABLE' });
    await expect(readiness.getAmbiguousFactAddresses(SCOPE)).resolves.toEqual([]);
  });

  // KHONG BAO DONG GIA: duong thay the binh thuong (thang 07 sang thang 08) khong duoc dinh vao
  // cong nay. Mot cong keu oan la mot cong se bi tat.
  it('thay the tuong minh van cho ra dung mot cau tra loi', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const july = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1_150_000 });
    const august = await confirmedFact(bravo.id, 'pricing', 'ELNI.price', { amount: 1_250_000 });

    await registry.supersedeFact(SCOPE, {
      previousFactId: july.id,
      nextFactId: august.id,
      at: new Date('2026-08-01T00:00:00Z'),
    });

    await expect(
      readiness.getEffectiveFact(SCOPE, 'pricing', 'ELNI.price', new Date('2026-08-15T00:00:00Z')),
    ).resolves.toMatchObject({ id: august.id });
    await expect(readiness.getAmbiguousFactAddresses(SCOPE)).resolves.toEqual([]);
  });
});

/* ================================================================== *
 * 2 — THAT BAI KHONG DE LAI TRANG THAI
 * ================================================================== */

describe('mot thao tac nghiep vu that bai khong de lai mot nua', () => {
  /**
   * Bai QUAN TRONG NHAT cua nhom nay. Truoc ban va, `approveSource()` ghi ban phe duyet TRUOC roi
   * moi chuyen trang thai — nen mot lan duyet bi tu choi van de lai ban ghi phe duyet, va lan sau
   * `transitionSource(..., 'APPROVED')` chi hoi "co phe duyet nao khong". Ket qua: mot lan duyet
   * DA THAT BAI tro thanh bang chung cho mot lan duyet KHAC thanh cong.
   */
  it('duyet hong khong de lai ban ghi phe duyet, va khong mo duong cho lan duyet sau', async () => {
    const source = await receivedSource();

    // `RECEIVED` khong co canh nao di thang toi `APPROVED` — nen phe duyet ghi duoc, nhung lan
    // chuyen trang thai ngay sau do bi tu choi.
    await expect(
      registry.approveSource(SCOPE, source.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'nguoi-co-tham-quyen',
        evidenceRef: 'HD/2026/PL01',
      }),
    ).rejects.toMatchObject({ reason: 'SOURCE_TRANSITION_NOT_PERMITTED' });

    expect(await repository.listApprovals(SCOPE, { sourceId: source.id })).toEqual([]);
    expect((await registry.findSourceById(SCOPE, source.id))?.status).toBe('RECEIVED');

    // Va day la he qua that su: sau khi da di dung duong, cong duyet VAN dong, vi khong con mot
    // ban ghi phe duyet ma troi nao o lai lam bang chung.
    await registry.transitionSource(SCOPE, source.id, 'REVIEWED');
    await expect(registry.transitionSource(SCOPE, source.id, 'APPROVED')).rejects.toMatchObject({
      reason: 'SOURCE_APPROVAL_MISSING',
    });
  });

  it('xac nhan su that hong khong de lai ban ghi phe duyet', async () => {
    const source = await receivedSource();
    const fact = await registry.submitFact(SCOPE, {
      domain: 'pricing',
      key: 'ELNI.price',
      value: { amount: 1_150_000 },
      sourceId: source.id,
      classification: 'INTERNAL',
    });

    // Nguon chua `EFFECTIVE` ⇒ su that khong duoc vuot len truoc nguon cua chinh no.
    await expect(
      registry.confirmFact(SCOPE, fact.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'nguoi-co-tham-quyen',
        evidenceRef: 'doc-tu-nguon',
      }),
    ).rejects.toMatchObject({ reason: 'FACT_SOURCE_NOT_EFFECTIVE' });

    expect(await repository.listApprovals(SCOPE, { factId: fact.id })).toEqual([]);
    expect((await registry.findFactById(SCOPE, fact.id))?.status).toBe('PROPOSED');
  });

  it('kich hoat hong khong de lai moc hieu luc', async () => {
    const source = await receivedSource();

    await expect(
      registry.makeSourceEffective(SCOPE, source.id, new Date('2026-01-01T00:00:00Z')),
    ).rejects.toMatchObject({ reason: 'SOURCE_TRANSITION_NOT_PERMITTED' });

    // Mot nguon `RECEIVED` mang `effectiveFrom` la mot nguon TRONG NHU da kich hoat ma chua.
    expect((await registry.findSourceById(SCOPE, source.id))?.effectiveFrom).toBeNull();
  });

  it('danh dau gia dinh hong khong de lai bon truong bang chung mo coi', async () => {
    const source = await effectiveSource('bang-gia', 'a'.repeat(64));
    const fact = await confirmedFact(source.id, 'pricing', 'ELNI.min_quantity', { min: 1 });

    // `CONFIRMED` sang `WORKING_ASSUMPTION` khong phai mot canh hop le: su that cua khach khong tu
    // ha xuong thanh gia dinh cua chung ta.
    await expect(
      registry.markWorkingAssumption(SCOPE, fact.id, {
        rationale: 'Chua hoi duoc khach',
        risk: 'Bao gia sai cho don nho',
        reversibility: 'Doi mot dong trong goi khach',
        owner: 'sale-lead',
      }),
    ).rejects.toMatchObject({ reason: 'FACT_TRANSITION_NOT_PERMITTED' });

    const after = await registry.findFactById(SCOPE, fact.id);
    expect(after?.status).toBe('CONFIRMED');
    expect(after?.assumptionRationale).toBeNull();
    expect(after?.assumptionRisk).toBeNull();
    expect(after?.assumptionReversibility).toBeNull();
    expect(after?.assumptionOwner).toBeNull();
  });

  /**
   * BON BAI TREN chung minh rollback khi CONG NGHIEP VU tu choi. Bai nay chung minh no khi CAU
   * GHI THU HAI HONG — truong hop ban review goi ten rieng ("or a DB write fails"), va la truong
   * hop khong bao gio tai hien duoc bang cach goi API sai.
   *
   * Ke ca sau khi da doi thu tu ghi trong `markWorkingAssumption`, van con mot cau ghi thu hai.
   * Neu no hong ma cau dau o lai thi bat bien "gia dinh phai co du bon truong" van thung — chi la
   * thung theo huong nguoc lai.
   */
  it('mot cau ghi hong giua chung thi ca thao tac bien mat, khong de lai cau ghi truoc do', async () => {
    const source = await effectiveSource('bang-gia', 'a'.repeat(64));
    const fact = await registry.submitFact(SCOPE, {
      domain: 'pricing',
      key: 'ELNI.min_quantity',
      value: { min: 1 },
      sourceId: source.id,
      classification: 'INTERNAL',
    });

    // Kho hong o dung cau ghi THU HAI cua thao tac: cau dau (bon truong bang chung) da vao, cau
    // sau (chuyen trang thai) no. Neu khong co giao dich, ban ghi se o lai voi bang chung day du
    // ma trang thai van `PROPOSED` — mot nua cua mot quyet dinh.
    const faulty = new FaultyRepository(repository, 2);
    const faultyRegistry = new SourceRegistryService(faulty);

    await expect(
      faultyRegistry.markWorkingAssumption(SCOPE, fact.id, {
        rationale: 'Chua hoi duoc khach',
        risk: 'Bao gia sai cho don nho',
        reversibility: 'Doi mot dong trong goi khach',
        owner: 'sale-lead',
      }),
    ).rejects.toThrow(/kho hong/i);

    const after = await registry.findFactById(SCOPE, fact.id);
    expect(after?.status).toBe('PROPOSED');
    expect(after?.assumptionRationale).toBeNull();
    expect(after?.assumptionOwner).toBeNull();
  });

  it('phe duyet da ghi bi go lai khi cau ghi ke tiep hong', async () => {
    const source = await registry.registerSource(SCOPE, {
      sourceKey: 'bang-gia',
      title: 'Ban cong bo',
      kind: 'announcement',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'INTERNAL',
      locator: 'vault://kiem-chung/bang-gia.pdf',
      contentHash: 'a'.repeat(64),
    });
    await registry.transitionSource(SCOPE, source.id, 'REVIEWED');

    // Cau ghi thu nhat cua `approveSource` la ban ghi phe duyet; cau thu hai la lan chuyen trang
    // thai. Cho cau thu hai hong.
    const faulty = new FaultyRepository(repository, 2);
    const faultyRegistry = new SourceRegistryService(faulty);

    await expect(
      faultyRegistry.approveSource(SCOPE, source.id, {
        level: 'CUSTOMER_CONFIRMED',
        actor: 'nguoi-co-tham-quyen',
        evidenceRef: 'HD/2026/PL01',
      }),
    ).rejects.toThrow(/kho hong/i);

    expect(await repository.listApprovals(SCOPE, { sourceId: source.id })).toEqual([]);
    expect((await registry.findSourceById(SCOPE, source.id))?.status).toBe('REVIEWED');
  });

  it('thay the hong khong de lai con tro supersedesId tro vo vong', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const previous = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1 });
    // Ban thay the o dia chi KHAC ⇒ cong dong ho dong, va khong ghi nao duoc phep o lai.
    const next = await confirmedFact(bravo.id, 'order_policy', 'max_quantity', { max: 50 });

    await expect(
      registry.supersedeFact(SCOPE, {
        previousFactId: previous.id,
        nextFactId: next.id,
        at: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(SourceRegistryError);

    expect((await registry.findFactById(SCOPE, next.id))?.supersedesId).toBeNull();
    expect((await registry.findFactById(SCOPE, previous.id))?.effectiveTo).toBeNull();
    expect((await registry.findFactById(SCOPE, previous.id))?.status).toBe('CONFIRMED');
  });
});

/* ================================================================== *
 * 3 — THAY THE PHAI CUNG DONG HO
 * ================================================================== */

describe('thay the chi hop le trong cung mot dong ho', () => {
  it('su that o dia chi khac KHONG thay the duoc', async () => {
    const alpha = await effectiveSource('bang-gia-a', 'a'.repeat(64));
    const bravo = await effectiveSource('bang-gia-b', 'b'.repeat(64));
    const price = await confirmedFact(alpha.id, 'pricing', 'ELNI.price', { amount: 1 });
    const policy = await confirmedFact(bravo.id, 'order_policy', 'max_quantity', { max: 50 });

    await expect(
      registry.supersedeFact(SCOPE, {
        previousFactId: price.id,
        nextFactId: policy.id,
        at: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ reason: 'FACT_SUPERSEDE_LINEAGE_MISMATCH' });
  });

  it('mot su that khong tu thay chinh no', async () => {
    const source = await effectiveSource('bang-gia', 'a'.repeat(64));
    const fact = await confirmedFact(source.id, 'pricing', 'ELNI.price', { amount: 1 });

    await expect(
      registry.supersedeFact(SCOPE, {
        previousFactId: fact.id,
        nextFactId: fact.id,
        at: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ reason: 'FACT_SUPERSEDE_SELF_REFERENCE' });
  });

  it('nguon khac sourceKey KHONG thay the duoc, va ban bi nham khong bi dong lai', async () => {
    const priceList = await effectiveSource('bang-gia-thang', 'a'.repeat(64));
    const annex = await effectiveSource('phu-luc-hop-dong', 'b'.repeat(64));

    await expect(
      registry.supersedeSource(SCOPE, {
        previousSourceId: priceList.id,
        nextSourceId: annex.id,
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ reason: 'SOURCE_SUPERSEDE_LINEAGE_MISMATCH' });

    const untouched = await registry.findSourceById(SCOPE, priceList.id);
    expect(untouched?.status).toBe('EFFECTIVE');
    expect(untouched?.effectiveTo).toBeNull();
    expect((await registry.findSourceById(SCOPE, annex.id))?.supersedesId).toBeNull();
  });

  it('mot nguon khong tu thay chinh no', async () => {
    const source = await effectiveSource('bang-gia-thang', 'a'.repeat(64));

    await expect(
      registry.supersedeSource(SCOPE, {
        previousSourceId: source.id,
        nextSourceId: source.id,
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ reason: 'SOURCE_SUPERSEDE_SELF_REFERENCE' });
  });

  it('cung sourceKey, khac hash = dung dong ho, nen thay the duoc', async () => {
    const v1 = await effectiveSource('bang-gia-thang', 'a'.repeat(64));
    const v2 = await registry.registerSource(SCOPE, {
      sourceKey: 'bang-gia-thang',
      title: 'Ban cong bo thang sau',
      kind: 'announcement',
      version: 'v2',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'INTERNAL',
      locator: 'vault://kiem-chung/bang-gia-thang-v2.pdf',
      contentHash: 'b'.repeat(64),
    });
    await registry.transitionSource(SCOPE, v2.id, 'REVIEWED');
    await registry.approveSource(SCOPE, v2.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'nguoi-co-tham-quyen',
      evidenceRef: 'HD/2026/PL02',
    });

    const result = await registry.supersedeSource(SCOPE, {
      previousSourceId: v1.id,
      nextSourceId: v2.id,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    });

    expect(result.previous.status).toBe('SUPERSEDED');
    expect(result.next.status).toBe('EFFECTIVE');
    expect(result.next.supersedesId).toBe(v1.id);
  });
});
