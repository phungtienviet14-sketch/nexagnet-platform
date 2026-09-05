import { narrativeOnlyPlan, type OutboundPlan } from '@netviet/shared';
import type { AdvisorReply } from '../advisor-agent.js';
import { NO_BUSINESS_FACTS, type TurnBusinessFacts } from '../../outbound/outbound-facts.js';
import { tenantSlug } from '@netviet/tenant';
import {
  documentEvidence,
  documentSourceId,
  evidenceVersion,
  type SourceEvidence,
} from '../../outbound/source-evidence.js';
import { EvidenceRegistry } from '../../outbound/evidence-registry.port.js';

/**
 * BAN SOAN GIA cua agent tu van, dung cho test.
 *
 * MAC DINH LA LUOT IT DAC QUYEN NHAT: ke hoach khong xin khoi nghiep vu nao, khong co du kien tat
 * dinh nao, khong co nguon he thong nao. Do la mac dinh DUNG cho mot fixture an toan — mot test
 * muon chung minh mot khoi duoc render thi phai TU khai bao du kien cho no, chu khong duoc thua
 * huong mot cach im lang.
 *
 * `sources` mac dinh RONG co hau qua nhin thay duoc: hop dong neo nguon (G1) se tu choi loi nhan.
 * Test nao can loi nhan di duoc toi khach phai truyen `sources` — dung nhu he thong that, noi loi
 * nhan chi ton tai khi luot do da tra cuu duoc mot tai lieu da duyet.
 */
/**
 * TAI LIEU DA DUYET GIA, DA DUOC TUYEN BO LA KE DUOC (Issue #205).
 *
 * Dung `tenantSlug()` THAT chu khong mot hang so: bo test nay chay qua orchestrator that, va
 * orchestrator loc bang chung theo khach dang chay. Mot slug bia se lam moi loi nhan bi tu choi
 * — dung, nhung vi mot ly do khong lien quan gi den thu bai test dinh chung minh.
 */
export function stubEvidence(
  texts: readonly string[],
  productSku: string | null = null,
): SourceEvidence[] {
  return texts.map((text) => {
    const evidence = documentEvidence(
      documentSourceId('faq', `stub:${evidenceVersion(text)}`, 'a'),
      text,
      { tenant: tenantSlug(), productSku },
      true,
    );
    PUBLISHED.set(evidence.sourceId, evidence.version);
    return evidence;
  });
}

/**
 * SO GHI cua nhung tai lieu gia ma bo test da "xuat ban".
 *
 * Diem nghen gui doi chieu tung ghim voi so ghi hien hanh (Issue #205, muc 8 ca 10), nen mot
 * bo test dung `stubEvidence` ma khong noi so ghi vao se bi tu choi — DUNG, va do la ly do
 * ham nay ton tai: no dung ra trang thai "tai lieu nay dang con hieu luc".
 */
const PUBLISHED = new Map<string, string>();

export function stubEvidenceRegistry(): EvidenceRegistry {
  return { narrativeEvidenceIndex: () => PUBLISHED };
}

/** Rut quyen ke cua mot manh bang chung — dung de chung minh ban soan cu dung lai o cong gui. */
export function revokeStubEvidence(evidence: SourceEvidence): void {
  PUBLISHED.delete(evidence.sourceId);
}

export function fakeAdvisorReply(
  overrides: Partial<AdvisorReply> & { readonly text: string },
): AdvisorReply {
  const plan: OutboundPlan = overrides.plan ?? narrativeOnlyPlan(overrides.text);
  const facts: TurnBusinessFacts = overrides.facts ?? NO_BUSINESS_FACTS;
  return {
    usedTools: [],
    handoff: false,
    authority: { grants: [] },
    sources: [],
    ...overrides,
    plan,
    facts,
  };
}
