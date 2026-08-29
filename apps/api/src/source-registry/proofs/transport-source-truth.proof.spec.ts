import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from '../in-memory-source-registry.repository.js';
import { SourceReadinessService } from '../source-readiness.service.js';
import { SourceRegistryService } from '../source-registry.service.js';
import { testTenantScope } from '../tenant-scope.js';

/**
 * BAN CHUNG MINH B — mien VAN TAI, dung API CHUNG.
 *
 * Lay mot xung dot CO THAT va DANG MO cua ho so van tai: `C-02` / `OPEN-10`.
 *
 * Nguon (mot tai lieu phan tich nghiep vu do chinh khach viet) noi hai dieu o hai muc khac nhau:
 *   · §6.4 — dong lech doi soat thi "canh bao kiem tra thu cong";
 *   · §9.1 — "tru vao luong cuoi thang neu lai xe con no ung / thieu chung tu".
 *
 * Day la mot ban chung minh MANH hon truong hop thong thuong, vi o day mot LAP LUAN TOT DA TON
 * TAI: tu dong bien mot dong lech doi soat thanh khoan tru luong la sai ca ve phap ly lao dong
 * lan quan he — mot dong lech co nhieu nguyen nhan khong thuoc loi lai xe. Va no VAN khong duoc
 * quyen dong xung dot, vi day la quyet dinh cua khach + phap ly, khong phai cua ky su.
 *
 * Do la dung cho phan biet `recommendation` voi `resolution`.
 *
 * KHONG doi hanh vi nghiep vu van tai nao. Tep nay chi ghi nguon/su that/xung dot.
 */

const TRANSPORT = testTenantScope('van-tai-viet');

let repository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let readiness: SourceReadinessService;

beforeEach(() => {
  repository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(repository);
  readiness = new SourceReadinessService(repository);
});

const RECEIVED_AT = new Date('2026-07-01T00:00:00Z');
const KEY = 'reconciliation.mismatch_handling';

/**
 * Tai lieu phan tich nghiep vu cua khach van tai.
 *
 * `locator` tro ra KHO RIENG NGOAI REPO va hash la thu duy nhat chung minh tinh toan ven — dung
 * cai giao thuc ma tep PDF that dang duoc giu theo (no khong nam trong repo nay, va khong duoc
 * nam trong repo nay).
 */
async function businessAnalysisDoc() {
  const source = await registry.registerSource(TRANSPORT, {
    sourceKey: 'phan-tich-nghiep-vu',
    title: 'Tai lieu phan tich nghiep vu ung dung van tai',
    kind: 'business_analysis',
    version: '1.0',
    origin: 'CUSTOMER_PROVIDED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'BUSINESS_SENSITIVE',
    locator: 'vault://van-tai-viet/phan-tich-nghiep-vu-v1.pdf',
    contentHash: 'e'.repeat(64),
    byteSize: 1_035_477,
    receivedAt: RECEIVED_AT,
  });
  await registry.transitionSource(TRANSPORT, source.id, 'NORMALIZED');
  await registry.transitionSource(TRANSPORT, source.id, 'REVIEWED');
  await registry.approveSource(TRANSPORT, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'product-owner',
    evidenceRef: 'tai lieu do chinh khach soan, da doc toan van 14/14 trang',
  });
  return registry.makeSourceEffective(TRANSPORT, source.id, RECEIVED_AT);
}

/** Hai su that CANH TRANH doc ra tu hai muc cua CUNG mot tai lieu. */
async function competingClauses(sourceId: string) {
  const manualReview = await registry.submitFact(TRANSPORT, {
    domain: 'reconciliation',
    key: KEY,
    value: { action: 'FLAG_FOR_MANUAL_REVIEW' },
    sourceId,
    classification: 'BUSINESS_SENSITIVE',
    sourceLocus: 'muc 6.4',
  });
  const payrollDeduction = await registry.submitFact(TRANSPORT, {
    domain: 'reconciliation',
    key: KEY,
    value: { action: 'DEDUCT_FROM_PAYROLL' },
    sourceId,
    classification: 'BUSINESS_SENSITIVE',
    sourceLocus: 'muc 9.1',
  });
  for (const fact of [manualReview, payrollDeduction]) {
    await registry.confirmFact(TRANSPORT, fact.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'product-owner',
      evidenceRef: 'doc nguyen van tu tai lieu khach',
    });
  }
  return { manualReview, payrollDeduction };
}

describe('B1 — C-02: hai dieu khoan cua CUNG mot tai lieu mau thuan nhau', () => {
  it('xung dot MO va van MO, du goi y da co lap luan vung', async () => {
    const source = await businessAnalysisDoc();
    const { manualReview, payrollDeduction } = await competingClauses(source.id);

    const conflict = await registry.openConflict(TRANSPORT, {
      conflictKey: 'C-02',
      domain: 'reconciliation',
      subjectKey: KEY,
      summary:
        'Dong lech doi soat: muc 6.4 noi canh bao kiem tra thu cong, muc 9.1 noi tru vao luong',
      impact: 'BLOCKING',
      factIds: [manualReview.id, payrollDeduction.id],
      recommendedFactId: manualReview.id,
      recommendationReason:
        'Mot dong lech co nhieu nguyen nhan khong thuoc loi lai xe; tru tien theo ket qua so khop may, khong giai trinh, sai ca phap ly lao dong lan quan he. Day la GOI Y, khong phai quyet dinh.',
    });

    expect(conflict.status).toBe('OPEN');
    expect(conflict.recommendedFactId).toBe(manualReview.id);

    // Lap luan da co, va xung dot VAN mo. Do la khac biet giua `recommendation` va `resolution`.
    expect(await readiness.getBlockingConflicts(TRANSPORT)).toHaveLength(1);
    await expect(
      readiness.canUseFact(TRANSPORT, 'reconciliation', KEY, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
  });

  it('khong dong duoc bang chinh goi y cua he thong lam dan chung', async () => {
    const source = await businessAnalysisDoc();
    const { manualReview, payrollDeduction } = await competingClauses(source.id);
    const conflict = await registry.openConflict(TRANSPORT, {
      conflictKey: 'C-02',
      domain: 'reconciliation',
      subjectKey: KEY,
      summary: 'x',
      factIds: [manualReview.id, payrollDeduction.id],
      recommendedFactId: manualReview.id,
      recommendationReason: 'lap luan cua he thong',
    });

    // Dan chung rong -> tu choi. Cong nay khong doc `recommendedFactId`, nen "he thong da goi y
    // roi" khong bao gio la mot duong tat.
    await expect(
      registry.resolveConflict(TRANSPORT, conflict.id, {
        winningFactId: manualReview.id,
        actor: 'ky-su',
        evidenceRef: '',
      }),
    ).rejects.toMatchObject({ reason: 'CONFLICT_EVIDENCE_MISSING' });

    expect((await registry.findConflictById(TRANSPORT, conflict.id))?.status).toBe('OPEN');
  });

  it('OPEN-10: chi khach + phap ly moi dong duoc, va luc do runtime mo lai', async () => {
    const source = await businessAnalysisDoc();
    const { manualReview, payrollDeduction } = await competingClauses(source.id);
    const conflict = await registry.openConflict(TRANSPORT, {
      conflictKey: 'C-02',
      domain: 'reconciliation',
      subjectKey: KEY,
      summary: 'x',
      factIds: [manualReview.id, payrollDeduction.id],
    });

    await registry.resolveConflict(TRANSPORT, conflict.id, {
      winningFactId: manualReview.id,
      actor: 'giam-doc-van-hanh',
      evidenceRef: 'bien ban hop 29/08/2026 + y kien tu van phap ly lao dong',
      note: 'Khong tu dong tru luong. Dong lech sinh canh bao, nguoi xu ly.',
    });

    const resolved = await registry.findConflictById(TRANSPORT, conflict.id);
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolutionRef).toContain('bien ban hop');

    await expect(
      readiness.canUseFact(TRANSPORT, 'reconciliation', KEY, 'CONFIRMED_ONLY'),
    ).resolves.toMatchObject({ allowed: true });
  });
});
