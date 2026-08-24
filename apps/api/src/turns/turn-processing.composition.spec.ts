import { describe, expect, it } from 'vitest';
import type { CapabilityId } from '@netviet/tenant';
import { buildAppComposition } from '../app-composition.js';

/**
 * RANH GIOI SO HUU — bo test nay la thu duy nhat chan viec "ban hang" bo lai lam chu duong xu ly
 * hoi thoai. No khong kiem tra hanh vi; no kiem tra AI SO HUU CAI GI, va co y de doc duoc nhu mot
 * to khai chu quyen.
 */
const NEUTRAL = [
  'knowledge',
  'messaging',
  'turn-processing',
] as const satisfies readonly CapabilityId[];
const SELLING = [
  'knowledge',
  'messaging',
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
] as const satisfies readonly CapabilityId[];

function providerName(provider: unknown): string {
  if (typeof provider === 'function') return provider.name;
  if (provider && typeof provider === 'object' && 'provide' in provider) {
    const token = (provider as { provide: unknown }).provide;
    return typeof token === 'function' ? token.name : String(token);
  }
  return String(provider);
}

const namesOf = (capabilities: readonly CapabilityId[]) =>
  buildAppComposition(capabilities).providers.map(providerName);

describe('so huu: turn-processing vs sales-order', () => {
  it('khach TRUNG TINH van co du duong xu ly mot luot', () => {
    const providers = namesOf(NEUTRAL);

    for (const owned of [
      'PipelineService',
      'AgentOrchestrator',
      'AgentEventsService',
      'ORDER_PARSER',
      'TurnRecordsRepository',
      'TurnReplyService',
      'ConversationsService',
      'ConversationThreadsRepository',
      'ConversationContextBuilder',
      'MessagesRepository',
      'ZcaListener',
      'BotPoller',
    ]) {
      expect(providers, `turn-processing phai so huu ${owned}`).toContain(owned);
    }
  });

  it('khach TRUNG TINH KHONG duoc dung toi don, gia hay ERP', () => {
    const providers = namesOf(NEUTRAL);

    for (const salesOnly of [
      'OrdersService',
      'OrdersRepository',
      'OrderAmendmentService',
      'OrderCommandAdapter',
      'ORDER_COMMANDS',
      'ErpPort',
      'CampaignService',
    ]) {
      expect(
        providers,
        `${salesOnly} thuoc sales-order, khong duoc nap cho khach trung tinh`,
      ).not.toContain(salesOnly);
    }

    const controllers = buildAppComposition(NEUTRAL).controllers.map((c) => c.name);
    expect(controllers).not.toContain('OrdersController');
    expect(controllers).not.toContain('ErpController');
    expect(controllers).toContain('StreamController');
    expect(controllers).toContain('MessagesController');
  });

  it('khach BAN HANG van co day du ca hai lop — sales-order chi THEM chu khong THAY', () => {
    const providers = namesOf(SELLING);

    expect(providers).toContain('PipelineService');
    expect(providers).toContain('TurnRecordsRepository');
    expect(providers).toContain('OrdersService');
    expect(providers).toContain('OrdersRepository');
  });

  it('bat sales-order khong lam doi duong xu ly luot cua khach trung tinh', () => {
    const neutral = new Set(namesOf(NEUTRAL));
    const selling = namesOf(SELLING);

    // Moi thu khach trung tinh co, khach ban hang cung phai co — neu khong thi mot trong hai
    // nhanh da bi fork.
    for (const name of neutral) expect(selling).toContain(name);
  });
});
