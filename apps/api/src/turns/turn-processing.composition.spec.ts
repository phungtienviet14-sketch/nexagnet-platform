import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      // Cong tu xac nhan don: mot POLICY BAN HANG, nen no den cung `sales-order` va bien mat
      // cung `sales-order`. Khach trung tinh khong co no, va do la ly do duong xu ly luot cua
      // khach do khong bao gio hoi "don nay co duoc tu gui khong".
      'SalesOrderOutcomeService',
      'TurnOutcomePort',
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
    // Bat ban hang = CAM cong tu xac nhan vao duong xu ly luot, khong phai sua duong do.
    expect(providers).toContain('SalesOrderOutcomeService');
    expect(providers).toContain('TurnOutcomePort');
  });

  it('bat sales-order khong lam doi duong xu ly luot cua khach trung tinh', () => {
    const neutral = new Set(namesOf(NEUTRAL));
    const selling = namesOf(SELLING);

    // Moi thu khach trung tinh co, khach ban hang cung phai co — neu khong thi mot trong hai
    // nhanh da bi fork.
    for (const name of neutral) expect(selling).toContain(name);
  });
});

/**
 * Cong so huu o muc MA NGUON, khong phai o muc do thi DI.
 *
 * Bang so huu ben tren chan viec NAP mot provider cua ban hang cho khach trung tinh, nhung no
 * khong chan duoc `PipelineService` IMPORT mot thu cua `orders/`. Mot import nhu vay khong lam
 * hong khach trung tinh ngay — no chi lam cho ranh gioi tro thanh mot loi hua thay vi mot su that,
 * va lan sau se co nguoi keo them mot ham nua qua duong do.
 */
describe('so huu o muc ma nguon', () => {
  const apiSrc = dirname(fileURLToPath(import.meta.url));
  const read = (relative: string) => readFileSync(resolve(apiSrc, '..', relative), 'utf8');

  const TURN_PROCESSING_SOURCES = [
    'pipeline/pipeline.service.ts',
    'turns/turn-reply.service.ts',
    'turns/turn-records.repository.ts',
    'turns/turn-decisions.ts',
    'turns/turn-outcome.port.ts',
  ];

  it.each(TURN_PROCESSING_SOURCES)('%s khong import gi tu orders/', (relative) => {
    const source = read(relative);
    const offenders = [...source.matchAll(/from '([^']*\/orders\/[^']*)'/g)].map((m) => m[1]);
    expect(offenders, `${relative} van con neo vao sales-order`).toEqual([]);
  });

  /**
   * Kiem tra tren MA, khong tren van xuoi.
   *
   * Chu thich cua cong VAN duoc phep ke lai lich su ("truoc day o day la mot cong tu xac nhan
   * don") — do la thu giup nguoi doc sau nay hieu vi sao cong ton tai. Cai khong duoc phep la
   * mot cai TEN cua ban hang xuat hien trong phan chay duoc: mot import, mot kieu, mot ma ly do.
   */
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('cong turn-outcome la TRUNG TINH — khong mot ten nao cua ban hang trong ma', () => {
    const code = stripComments(read('turns/turn-outcome.port.ts'));
    for (const salesTerm of [
      'auto_confirm',
      'AutoConfirm',
      'OrdersService',
      'SALES_ORDER_DECISIONS',
      'tenantOrderAutomation',
      'priced',
      'dealer',
      'erp',
      'Erp',
    ]) {
      expect(code, `cong trung tinh khong duoc nhac "${salesTerm}"`).not.toContain(salesTerm);
    }
  });
});
