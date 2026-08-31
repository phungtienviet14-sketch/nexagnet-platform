import { beforeEach, describe, expect, it } from 'vitest';
import { SALES_ORDER_DECISIONS } from '../../orders/sales-order-decisions.js';
import { InMemorySourceRegistryRepository } from '../../source-registry/in-memory-source-registry.repository.js';
import { SourceRegistryService } from '../../source-registry/source-registry.service.js';
import { testTenantScope } from '../../source-registry/tenant-scope.js';
import { DecisionLedgerService } from '../decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from '../in-memory-decision-ledger.repository.js';

/**
 * BAN CHUNG MINH A — mien BAN HANG, dung API CHUNG cua so cai (muc 7 hop dong nhiem vu).
 *
 * Duong nghiep vu duoc dung lai o day la duong dat hang that:
 *
 *   tin nhan/don -> quyet dinh gia cho dai ly -> tham chieu su that/nguon/chinh sach
 *   -> ma ly do -> don da co gia / ban giao -> tuong quan trace/workflow/release
 *
 * BA DIEU KHONG DUOC XUAT HIEN trong tep nay, va do la trong tam cua ban chung minh:
 *   1. mot ham nao rieng cho ban hang — no chi goi `record()`/`correct()` nhu moi mien khac;
 *   2. mot ma ly do bia — moi ma den tu `SALES_ORDER_DECISIONS` da co tren `main`;
 *   3. MOT CON SO TIEN NAO. Muc 7 noi ro: khong dat gia that cua dai ly vao ban chung minh. So
 *      cai ghi VI SAO mot muc gia duoc ap, khong ghi muc gia.
 *
 * SO LIEU LA TONG HOP. `sku.DEMO-01` khong phai ma that cua khach.
 */

const ULTTY = testTenantScope('ultty');

let ledgerRepository: InMemoryDecisionLedgerRepository;
let sourceRepository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let ledger: DecisionLedgerService;

beforeEach(() => {
  ledgerRepository = new InMemoryDecisionLedgerRepository();
  sourceRepository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(sourceRepository);
  ledger = new DecisionLedgerService(ledgerRepository, undefined, sourceRepository);
});

const AT = new Date('2026-08-31T02:00:00Z');
const ORDER = { type: 'order', id: 'ord_01H8XGJDEMO' } as const;
const PRICE_KEY = 'sku.DEMO-01.wholesale';

/** Dua mot su that gia di het duong toi `CONFIRMED`, kem ban cong bo dang sau no. */
async function confirmedPricingFact(version: string, hash: string) {
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
    receivedAt: AT,
  });
  await registry.transitionSource(ULTTY, source.id, 'REVIEWED');
  await registry.approveSource(ULTTY, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'sale-lead',
    evidenceRef: `cong-bo-${version}`,
  });
  const effective = await registry.makeSourceEffective(ULTTY, source.id, AT);

  const fact = await registry.submitFact(ULTTY, {
    domain: 'pricing',
    key: PRICE_KEY,
    // Gia tri nam trong so NGUON SU THAT (phan loai `BUSINESS_SENSITIVE`), KHONG trong so cai.
    value: { amount: 1_000_000, currency: 'VND' },
    sourceId: effective.id,
    classification: 'BUSINESS_SENSITIVE',
    sourceLocus: 'trang 2, dong 4',
    effectiveFrom: AT,
  });
  await registry.confirmFact(ULTTY, fact.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'sale-lead',
    evidenceRef: `cong-bo-${version}`,
  });
  return { source: effective, fact };
}

describe('A1 — duong gia dai ly: mot don, bon quyet dinh, mot dong thoi gian', () => {
  it('doc lai duoc ca chuoi, kem su that/nguon/chinh sach, va KHONG mot khoa tien nao', async () => {
    const { source, fact } = await confirmedPricingFact('T8', '8'.repeat(64));
    const factRef = {
      factId: fact.id,
      factDomain: 'pricing',
      factKey: PRICE_KEY,
      factStatusAtUse: 'CONFIRMED',
    };

    // 1. GIA — quyet dinh TAT DINH cua rules engine. Ma ly do noi ro da ap deal rieng cua dai ly.
    await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'rules.dealer_price',
      outcome: 'allowed',
      reason: 'DEALER_PRICE_OVERRIDE_APPLIED',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-don-1' },
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      policyRef: 'pricing.dealer_override',
      policyVersion: 'v1',
      occurredAt: AT,
      facts: [factRef],
      detail: { overrideRecordId: 'ovr_01H8XGJ', minQuantity: 10, orderedQuantity: 40 },
    });

    // 2. TINH GIA CA DON — khong canh bao.
    await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'rules.price',
      outcome: 'allowed',
      reason: 'PRICED_CLEAN',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-don-1' },
      actorKind: 'DETERMINISTIC_RULE',
      occurredAt: new Date('2026-08-31T02:00:01Z'),
      facts: [factRef],
    });

    // 3. NGUONG TU XAC NHAN — cong DONG. Day la ca quan trong nhat cua GD1: don vuot nguong thi
    //    chuyen Sale TRUOC khi gui.
    await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.auto_confirm',
      outcome: 'denied',
      reason: 'QUANTITY_ABOVE_THRESHOLD',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-don-1' },
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      policyRef: 'order.auto_confirm.max_quantity',
      policyVersion: 'v1',
      occurredAt: new Date('2026-08-31T02:00:02Z'),
      detail: { totalQuantity: 60, threshold: 50 },
    });

    // 4. NGUOI DUYET — cong KHAC, luot KHAC, chu the quyet dinh KHAC.
    await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.manual_approve',
      outcome: 'allowed',
      reason: 'ROUTED_TO_CONFIRMATION',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-duyet-1' },
      actorKind: 'HUMAN',
      actorRef: 'sale-lead',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      approvalRef: 'console:duyet:2026-08-31',
      occurredAt: new Date('2026-08-31T02:05:00Z'),
    });

    const timeline = await ledger.timelineForSubject(ULTTY, 'order', ORDER.id);
    expect(timeline.map((row) => [row.decisionPoint, row.reasonCode])).toEqual([
      ['rules.dealer_price', 'DEALER_PRICE_OVERRIDE_APPLIED'],
      ['rules.price', 'PRICED_CLEAN'],
      ['order.auto_confirm', 'QUANTITY_ABOVE_THRESHOLD'],
      ['order.manual_approve', 'ROUTED_TO_CONFIRMATION'],
    ]);

    // Quyet dinh gia tro DUNG ban su that va DUNG ban cong bo da dung.
    expect(timeline[0]?.factRefs).toEqual([
      expect.objectContaining({
        factId: fact.id,
        factKey: PRICE_KEY,
        factStatusAtUse: 'CONFIRMED',
        sourceId: source.id,
        sourceKey: 'thong-bao-gia',
        sourceVersion: 'T8',
      }),
    ]);

    // Ba cong tien/tham quyen deu dung muc, nen chinh sach fail-closed ap vao chung.
    expect(timeline.filter((row) => row.criticality === 'FINANCIAL_OR_AUTHORIZATION')).toHaveLength(
      3,
    );

    // Hai luot RIENG BIET tren cung mot ca.
    expect(await ledger.listForTrace(ULTTY, 'trace-don-1')).toHaveLength(3);
    expect(await ledger.listForTrace(ULTTY, 'trace-duyet-1')).toHaveLength(1);

    // KHONG MOT KHOA TIEN NAO trong toan bo bang chung cua ban chung minh nay.
    expect(timeline.flatMap((row) => Object.keys(row.detail ?? {}))).toEqual([
      'overrideRecordId',
      'minQuantity',
      'orderedQuantity',
      'totalQuantity',
      'threshold',
    ]);
  });
});

describe('A2 — bang gia doi ky sau: don cu VAN doc ra ban gia da dung luc do', () => {
  it('ban su that bi thay the, quyet dinh cu khong bi viet lai', async () => {
    const july = await confirmedPricingFact('T7', '7'.repeat(64));
    await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'rules.dealer_price',
      outcome: 'allowed',
      reason: 'DEALER_PRICE_BASE_NO_OVERRIDE',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-thang-7' },
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      occurredAt: AT,
      facts: [
        {
          factId: july.fact.id,
          factDomain: 'pricing',
          factKey: PRICE_KEY,
          factStatusAtUse: 'CONFIRMED',
        },
      ],
    });

    // Ky sau: ban T8 thay ban T7 tai cung dia chi su that.
    const august = await confirmedPricingFact('T8', '8'.repeat(64));
    await registry.supersedeFact(ULTTY, {
      previousFactId: july.fact.id,
      nextFactId: august.fact.id,
      at: new Date('2026-09-01T00:00:00Z'),
    });

    const [decision] = await ledger.timelineForSubject(ULTTY, 'order', ORDER.id);
    // Van la ban T7, VOI trang thai luc dung. Doc ra T8 o day nghia la don cua ky truoc se duoc
    // doi soat bang bang gia cua ky sau — dung kieu viet lai lich su ma muc 9 hop dong cam.
    expect(decision?.factRefs[0]).toMatchObject({
      factId: july.fact.id,
      sourceVersion: 'T7',
      factStatusAtUse: 'CONFIRMED',
    });
    expect(decision?.factRefs[0]?.factId).not.toBe(august.fact.id);
  });
});

describe('A3 — LLM de xuat, NGUOI quyet: hai hang, khong lan vai', () => {
  it('de xuat cua LLM khong bao gio la quyet dinh tien/tham quyen', async () => {
    // Duong SAI bi dong o tang kieu chay.
    await expect(
      ledger.record({
        scope: ULTTY,
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.manual_approve',
        outcome: 'allowed',
        reason: 'ROUTED_TO_CONFIRMATION',
        subject: ORDER,
        occurrence: { kind: 'turn', traceId: 'trace-llm' },
        actorKind: 'LLM_RECOMMENDATION',
        criticality: 'FINANCIAL_OR_AUTHORIZATION',
        model: { provider: 'anthropic', ref: 'claude-opus-5' },
      }),
    ).rejects.toMatchObject({ reason: 'LEDGER_LLM_NOT_AUTHORITATIVE' });

    // Duong DUNG: de xuat o muc quan sat, roi quyet dinh cua nguoi tro nguoc ve no.
    const advice = await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'rules.price',
      outcome: 'degraded',
      reason: 'SKU_UNRESOLVED',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-llm' },
      actorKind: 'LLM_RECOMMENDATION',
      criticality: 'ADVISORY',
      model: { provider: 'anthropic', ref: 'claude-opus-5' },
      occurredAt: AT,
    });
    const adviceId = advice.decision?.id;
    if (!adviceId) throw new Error('phai ghi duoc de xuat');

    const decided = await ledger.record({
      scope: ULTTY,
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.manual_approve',
      outcome: 'allowed',
      reason: 'ROUTED_TO_CONFIRMATION',
      subject: ORDER,
      occurrence: { kind: 'turn', traceId: 'trace-nguoi' },
      actorKind: 'HUMAN',
      actorRef: 'sale-lead',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      occurredAt: new Date('2026-08-31T02:10:00Z'),
      relations: [{ kind: 'PARENT_DECISION', targetType: 'decision', targetId: adviceId }],
    });

    expect(decided.decision?.actorKind).toBe('HUMAN');
    // Quyet dinh cua NGUOI khong mang metadata model — no khong phai mot lan goi LLM.
    expect(decided.decision?.modelRef).toBeNull();
    expect(decided.decision?.relations).toEqual([
      expect.objectContaining({ kind: 'PARENT_DECISION', targetId: adviceId }),
    ]);
    // Hai hang, phan biet duoc: mot de xuat va mot quyet dinh.
    const timeline = await ledger.timelineForSubject(ULTTY, 'order', ORDER.id);
    expect(timeline.map((row) => row.actorKind)).toEqual(['LLM_RECOMMENDATION', 'HUMAN']);
  });
});
