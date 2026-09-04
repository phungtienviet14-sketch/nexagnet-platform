import { narrativeOnlyPlan, type OutboundPlan } from '@netviet/shared';
import type { AdvisorReply } from '../advisor-agent.js';
import { NO_BUSINESS_FACTS, type TurnBusinessFacts } from '../../outbound/outbound-facts.js';

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
