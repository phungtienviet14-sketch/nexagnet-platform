import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaSourceRegistryRepository } from './prisma-source-registry.repository.js';
import { SourceReadinessService } from './source-readiness.service.js';
import { SourceRegistryService } from './source-registry.service.js';
import { testTenantScope } from './tenant-scope.js';

/**
 * NGUON SU THAT tren Postgres THAT — chin buoc cua muc 19 hop dong nhiem vu.
 *
 * Bo in-memory chung minh QUY TAC; bo nay chung minh cai ma quy tac do dua vao: migration ap
 * duoc, khoa duy nhat `(tenantId, sourceKey, contentHash)` that su chan trung, `Json` giu duoc
 * gia tri co cau truc, quan he tu tro (`supersedes`) khong lam vong, va — quan trong nhat — du
 * lieu SONG QUA mot lan dung ket noi.
 *
 * `describe.runIf` theo quy uoc repo: khong co DB thi bo qua thay vi do. Nhung "xanh o may" KHONG
 * phu nhung bai nay; chung chay o job `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Source registry (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repository = new PrismaSourceRegistryRepository(prisma);
  const registry = new SourceRegistryService(repository);
  const readiness = new SourceReadinessService(repository);

  // Hai khach chay trong CUNG mot DB — day la dieu ma trien khai hom nay chua lam, va la dung ly
  // do bai cach ly phai chay o day chu khong chi o bo nho.
  const ALPHA = testTenantScope('it-src-alpha');
  const BRAVO = testTenantScope('it-src-bravo');
  const TENANTS = [ALPHA.tenantId, BRAVO.tenantId];

  const DOMAIN = 'it_pricing';
  const KEY = 'it.sku.DEMO.wholesale';

  async function cleanup(): Promise<void> {
    // Thu tu xoa di theo chieu phu thuoc; `deleteMany` gioi han dung hai tenant cua bai test —
    // KHONG bao gio dung `deleteMany({})` o day, DB nay co the dang chua du lieu that.
    const conflicts = await prisma.businessConflict.findMany({
      where: { tenantId: { in: TENANTS } },
      select: { id: true },
    });
    await prisma.businessConflictFact.deleteMany({
      where: { conflictId: { in: conflicts.map((row) => row.id) } },
    });
    await prisma.businessConflict.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.businessApproval.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.businessRequiredFact.deleteMany({ where: { tenantId: { in: TENANTS } } });
    // Su that tro toi nhau qua `supersedesId`: go lien ket truoc roi moi xoa.
    await prisma.businessFact.updateMany({
      where: { tenantId: { in: TENANTS } },
      data: { supersedesId: null },
    });
    await prisma.businessFact.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.businessSource.updateMany({
      where: { tenantId: { in: TENANTS } },
      data: { supersedesId: null },
    });
    await prisma.businessSource.deleteMany({ where: { tenantId: { in: TENANTS } } });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /** Dua mot nguon di het duong toi `EFFECTIVE`. */
  async function effective(scope: typeof ALPHA, version: string, hash: string, at: Date) {
    const source = await registry.registerSource(scope, {
      sourceKey: 'it-bang-cong-bo',
      title: `Ban cong bo ${version}`,
      kind: 'it_announcement',
      version,
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      locator: `vault://it/${version}`,
      contentHash: hash,
      byteSize: 1234,
      receivedAt: at,
    });
    await registry.transitionSource(scope, source.id, 'REVIEWED');
    await registry.approveSource(scope, source.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: `it-evidence-${version}`,
    });
    return registry.makeSourceEffective(scope, source.id, at);
  }

  it('chin buoc: dang ky -> hieu luc -> thay the -> lich su -> xung dot -> cach ly -> ben vung', async () => {
    const T1 = new Date('2026-03-01T00:00:00Z');
    const T2 = new Date('2026-04-01T00:00:00Z');

    // (1) dang ky nguon A + su that A
    const sourceA = await effective(ALPHA, 'v1', 'a1'.repeat(32), T1);
    expect(sourceA.status).toBe('EFFECTIVE');

    const factA = await registry.submitFact(ALPHA, {
      domain: DOMAIN,
      key: KEY,
      // Gia tri CO CAU TRUC — chung minh cot `Json` giu duoc hinh dang, khong ep ve chuoi.
      value: { amount: 1_000_000, currency: 'VND', tiers: [1, 5, 10] },
      sourceId: sourceA.id,
      classification: 'BUSINESS_SENSITIVE',
      sourceLocus: 'trang 2',
      effectiveFrom: T1,
    });

    // (2) duyet + cho hieu luc
    const confirmedA = await registry.confirmFact(ALPHA, factA.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: 'it-confirm-a',
    });
    expect(confirmedA.status).toBe('CONFIRMED');

    // (3) dang ky nguon B — CUNG sourceKey, KHAC hash: phai la ban khac
    const sourceB = await effective(ALPHA, 'v2', 'b2'.repeat(32), T2);
    expect(sourceB.id).not.toBe(sourceA.id);

    // (4) B thay the A
    const supersededSource = await registry.supersedeSource(ALPHA, {
      previousSourceId: sourceA.id,
      nextSourceId: sourceB.id,
      effectiveFrom: T2,
    });
    expect(supersededSource.previous.status).toBe('SUPERSEDED');

    const factB = await registry.submitFact(ALPHA, {
      domain: DOMAIN,
      key: KEY,
      value: { amount: 900_000, currency: 'VND', tiers: [1, 5, 10] },
      sourceId: sourceB.id,
      classification: 'BUSINESS_SENSITIVE',
      effectiveFrom: T2,
    });
    await registry.confirmFact(ALPHA, factB.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: 'it-confirm-b',
    });
    await registry.supersedeFact(ALPHA, {
      previousFactId: factA.id,
      nextFactId: factB.id,
      at: T2,
    });

    // (5) hoi hien tai -> B
    const current = await readiness.getEffectiveFact(ALPHA, DOMAIN, KEY, T2);
    expect(current?.id).toBe(factB.id);
    expect(current?.value).toEqual({ amount: 900_000, currency: 'VND', tiers: [1, 5, 10] });

    // (6) hoi lich su -> A + B, dung thu tu, A da SUPERSEDED
    const history = await readiness.getFactHistory(ALPHA, DOMAIN, KEY);
    expect(history.map((row) => row.id)).toEqual([factA.id, factB.id]);
    expect(history[0]?.status).toBe('SUPERSEDED');
    expect(history[0]?.effectiveTo).toEqual(T2);

    // (7) mo xung dot -> readiness dung an toan
    const rival = await registry.submitFact(ALPHA, {
      domain: DOMAIN,
      key: KEY,
      value: { amount: 950_000, currency: 'VND' },
      sourceId: sourceB.id,
      classification: 'BUSINESS_SENSITIVE',
    });
    await registry.confirmFact(ALPHA, rival.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: 'it-confirm-rival',
    });
    const conflict = await registry.openConflict(ALPHA, {
      conflictKey: 'IT-CONFLICT-01',
      domain: DOMAIN,
      subjectKey: KEY,
      summary: 'Hai ban doc khac nhau',
      impact: 'BLOCKING',
      factIds: [factB.id, rival.id],
      recommendedFactId: factB.id,
      recommendationReason: 'goi y — khong dong xung dot',
    });
    expect(conflict.status).toBe('OPEN');
    expect([...conflict.factIds].sort()).toEqual([factB.id, rival.id].sort());

    await expect(
      readiness.canUseFact(ALPHA, DOMAIN, KEY, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });

    // (8) cach ly khach — CUNG mot DB, hai tenantId
    expect(await registry.findSourceById(BRAVO, sourceA.id)).toBeNull();
    expect(await registry.findFactById(BRAVO, factB.id)).toBeNull();
    expect(await registry.listSources(BRAVO)).toEqual([]);
    expect(await readiness.getFactHistory(BRAVO, DOMAIN, KEY)).toEqual([]);
    expect(await readiness.getBlockingConflicts(BRAVO)).toEqual([]);
    await expect(
      registry.resolveConflict(BRAVO, conflict.id, {
        winningFactId: factB.id,
        actor: 'ke-la',
        evidenceRef: 'gia-mao',
      }),
    ).rejects.toMatchObject({ reason: 'CONFLICT_NOT_FOUND' });
  });

  /**
   * (9) BEN VUNG QUA MOT LAN DUNG KET NOI.
   *
   * Bai nay dung mot `PrismaService` MOI hoan toan — tuong duong mot lan khoi dong lai tien trinh
   * API. Neu trang thai chi song trong bo nho cua tien trinh cu thi no do o day, va do la dieu
   * duy nhat phan biet "co ghi DB" voi "co ve nhu co ghi DB".
   */
  it('trang thai song sot qua mot ket noi moi (tuong duong restart API)', async () => {
    const AT = new Date('2026-05-01T00:00:00Z');
    const source = await effective(ALPHA, 'v-persist', 'c3'.repeat(32), AT);
    const fact = await registry.submitFact(ALPHA, {
      domain: DOMAIN,
      key: 'it.persist.key',
      value: { note: 'ben vung' },
      sourceId: source.id,
      classification: 'INTERNAL',
    });
    await registry.confirmFact(ALPHA, fact.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: 'it-persist',
    });

    const reconnected = new PrismaService();
    try {
      const freshRepo = new PrismaSourceRegistryRepository(reconnected);
      const freshReadiness = new SourceReadinessService(freshRepo);

      const seen = await freshReadiness.getEffectiveFact(ALPHA, DOMAIN, 'it.persist.key', AT);
      expect(seen?.id).toBe(fact.id);
      expect(seen?.value).toEqual({ note: 'ben vung' });

      const seenSource = await freshRepo.findSourceById(ALPHA, source.id);
      expect(seenSource?.status).toBe('EFFECTIVE');
      expect(seenSource?.contentHash).toBe('c3'.repeat(32));

      // Cach ly van dung sau khi ket noi lai.
      expect(await freshRepo.findSourceById(BRAVO, source.id)).toBeNull();
    } finally {
      await reconnected.$disconnect();
    }
  });

  /**
   * Khoa duy nhat `(tenantId, sourceKey, contentHash)` phai la mot rang buoc CUA DB, khong phai
   * mot phep kiem trong code. Hai tien trinh chay song song se di qua phep kiem trong code cung
   * luc; chi mot rang buoc o DB moi chan duoc.
   */
  it('DB tu chan hai ban trung (tenant, sourceKey, hash)', async () => {
    const AT = new Date('2026-06-01T00:00:00Z');
    const hash = 'd4'.repeat(32);
    await registry.registerSource(ALPHA, {
      sourceKey: 'it-trung',
      title: 'Ban dau',
      kind: 'it_announcement',
      version: 'v1',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'INTERNAL',
      locator: 'vault://it/trung',
      contentHash: hash,
      receivedAt: AT,
    });

    // Di THANG xuong kho, bo qua duong `registerSource` (duong do da tra ve ban cu). Day la cach
    // duy nhat hoi thang DB xem rang buoc co that hay khong.
    await expect(
      repository.createSource(ALPHA, {
        sourceKey: 'it-trung',
        title: 'Ban trung',
        kind: 'it_announcement',
        version: 'v2',
        origin: 'CUSTOMER_SIGNED',
        authority: 'L2_CUSTOMER_PUBLISHED',
        classification: 'INTERNAL',
        status: 'RECEIVED',
        locator: 'vault://it/trung-2',
        contentHash: hash,
        byteSize: null,
        receivedAt: AT,
        effectiveFrom: null,
        effectiveTo: null,
        supersedesId: null,
        note: null,
      }),
    ).rejects.toThrow();

    // ...nhung KHAC hash thi phai vao duoc: hai ban cua cung mot tai lieu cung ton tai.
    const other = await repository.createSource(ALPHA, {
      sourceKey: 'it-trung',
      title: 'Ban khac hash',
      kind: 'it_announcement',
      version: 'v2',
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'INTERNAL',
      status: 'RECEIVED',
      locator: 'vault://it/trung-3',
      contentHash: 'e5'.repeat(32),
      byteSize: null,
      receivedAt: AT,
      effectiveFrom: null,
      effectiveTo: null,
      supersedesId: null,
      note: null,
    });
    expect(other.id).toBeTruthy();
  });
});
