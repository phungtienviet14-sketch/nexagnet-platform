import type { ChannelMessage, Intent, ParseResult } from '@netviet/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DealerPriceOverride, KnowledgeSnapshot } from '../knowledge/domain.js';
import { KnowledgeRepository } from '../knowledge/knowledge.repository.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { selectCurrentSnapshotPrices } from '../knowledge/price-periods.js';
import { SEED } from '../knowledge/seed.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import type { TelemetryRecord, TelemetrySink } from '../observability/telemetry-record.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import type { OrderParser, ParserInput } from '../pipeline/order-parser.js';
import { AgentOrchestrator } from './agent-orchestrator.service.js';

/**
 * CAU HOI DEBUG: "dai ly bao gia nay sai" — trace co noi duoc VI SAO ra con so do khong?
 *
 * Issue #77 §6 doi mot bang chung CO KIEU moi khi deal rieng duoc chon. Truoc U2 Step 2, trace chi
 * co `rules.price` noi ve ca don; doc no khong biet duoc dong hang do an gia rieng hay gia si
 * chung, cang khong biet vi sao mot deal DANG NAM TRONG DB lai khong duoc ap.
 *
 * §6 cung cam ro: khong duoc de gia tri tien ro ri vao telemetry. Repo la PUBLIC.
 */

const GROUP = SEED.groups[0]!;
/**
 * Nhom dau tien cua goi khach PHAI da map dai ly — ca bo test nay noi ve gia rieng THEO DAI LY,
 * nen mot nhom chua map se lam moi khang dinh o duoi roi vao nhanh `DEALER_UNKNOWN` va van xanh
 * ma khong chung minh gi. Nem ngay o day de hong-do-goi-khach khac hong-do-code.
 */
if (!GROUP.dealerId) throw new Error('Goi khach phai co it nhat mot nhom da map dai ly');
const DEALER_ID: string = GROUP.dealerId;
const SKU = 'ELNI';
const SYNTHETIC_OVERRIDE_PRICE = 1_234_000;

class RecordingSink implements TelemetrySink {
  readonly records: TelemetryRecord[] = [];
  record(record: TelemetryRecord): void {
    this.records.push(record);
  }
}

/** Nguon su that = SEED + dung mot deal tong hop do bo test dat vao. */
class StubKnowledgeRepository extends KnowledgeRepository {
  constructor(private readonly overrides: readonly DealerPriceOverride[]) {
    super();
  }
  async loadSnapshot(): Promise<KnowledgeSnapshot> {
    return {
      ...SEED,
      prices: selectCurrentSnapshotPrices(SEED, new Date('2026-08-15T00:00:00Z')),
      priceOverrides: [...this.overrides],
    };
  }
}

class OrderParserStub implements OrderParser {
  readonly name = 'stub';
  constructor(private readonly quantity: number) {}
  async parse(_input: ParserInput): Promise<ParseResult> {
    return {
      intent: 'dat_don' as Intent,
      confidence: { intent: 0.95 },
      order: {
        orderType: 'TH1',
        items: [{ skuRaw: SKU, quantity: this.quantity }],
        noVat: false,
      },
    };
  }
}

function message(): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'copilot_paste',
    chatType: 'group',
    externalChatId: GROUP.chatId,
    text: `${SKU} lay hang`,
    sentAt: new Date(),
  };
}

async function dispatch(options: {
  overrides: readonly DealerPriceOverride[];
  quantity: number;
}): Promise<RecordingSink> {
  const sink = new RecordingSink();
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: {
      tenant: 'ultty',
      environment: 'test',
      gitSha: 'c37ee04'.padEnd(40, '0'),
      source: 'manifest',
    },
    privacy: 'full',
    sinks: [sink],
  });

  const knowledge = new KnowledgeService(
    new StubKnowledgeRepository(options.overrides),
    new Date('2026-08-15T00:00:00Z'),
  );
  await knowledge.reload();

  const orchestrator = new AgentOrchestrator(
    new OrderParserStub(options.quantity),
    knowledge,
    new InMemoryOrdersRepository(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    telemetry,
  );
  await orchestrator.run(message());
  return sink;
}

type DecisionRecord = Extract<TelemetryRecord, { type: 'decision' }>;

function dealerPriceDecisions(sink: RecordingSink): DecisionRecord[] {
  return sink.records.filter(
    (record): record is DecisionRecord =>
      record.type === 'decision' && record.point === 'rules.dealer_price',
  );
}

function override(patch: Partial<DealerPriceOverride> = {}): DealerPriceOverride {
  return {
    id: 'ovr-evidence-1',
    dealerId: DEALER_ID,
    sku: SKU,
    price: SYNTHETIC_OVERRIDE_PRICE,
    minQuantity: 1,
    enabled: true,
    ...patch,
  };
}

describe('BANG CHUNG RUNTIME: deal rieng theo dai ly (Issue #77 §6)', () => {
  let basePrice: number;

  beforeEach(() => {
    const row = selectCurrentSnapshotPrices(SEED, new Date('2026-08-15T00:00:00Z')).find(
      (price) => price.sku === SKU,
    );
    expect(row, `goi khach phai co dong gia cho ${SKU}`).toBeDefined();
    basePrice = row!.wholesale;
  });

  it('ap deal rieng -> phat DUNG mot quyet dinh co ma, kem ID ban ghi va nguong', async () => {
    const sink = await dispatch({ overrides: [override()], quantity: 1 });
    const decisions = dealerPriceDecisions(sink);

    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
    expect(decisions[0]!.outcome).toBe('allowed');
    expect(decisions[0]!.detail).toMatchObject({
      dealerId: DEALER_ID,
      sku: SKU,
      quantity: 1,
      overrideId: 'ovr-evidence-1',
      minQuantity: 1,
      priceSource: 'dealer_override',
    });
  });

  /**
   * Day la khang dinh BAO MAT cua §6, khong phai mot khang dinh phong cach: gia rieng theo dai ly
   * la du lieu kinh doanh mat, va trace thi di ra ngoai qua ClickStack/log. Mot lan them
   * `price` vao `detail` cho tien debug se lam ro ri ca ma tran gia.
   */
  it('KHONG mot gia tri tien nao lot vao bang chung', async () => {
    const sink = await dispatch({ overrides: [override()], quantity: 3 });
    const decision = dealerPriceDecisions(sink)[0]!;

    const serialized = JSON.stringify(decision.detail);
    expect(serialized).not.toContain(String(SYNTHETIC_OVERRIDE_PRICE));
    expect(serialized).not.toContain(String(basePrice));
    expect(Object.keys(decision.detail ?? {})).not.toContain('price');
    expect(Object.keys(decision.detail ?? {})).not.toContain('unitPrice');
  });

  it('deal het han -> bang chung noi RO la het han, khong im lang roi ve gia si', async () => {
    const sink = await dispatch({
      overrides: [override({ effectiveTo: new Date('2026-07-31T00:00:00Z') })],
      quantity: 10,
    });
    const decision = dealerPriceDecisions(sink)[0]!;
    expect(decision.reason).toBe('DEALER_PRICE_OVERRIDE_EXPIRED');
    expect(decision.outcome).toBe('degraded');
    // ID van co mat: nguoi doc trace phai mo duoc DUNG hang trong Postgres de gia han.
    expect(decision.detail).toMatchObject({ overrideId: 'ovr-evidence-1' });
  });

  it('chua dat nguong -> bang chung noi ro nguong la bao nhieu', async () => {
    const sink = await dispatch({ overrides: [override({ minQuantity: 5 })], quantity: 4 });
    const decision = dealerPriceDecisions(sink)[0]!;
    expect(decision.reason).toBe('DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY');
    expect(decision.detail).toMatchObject({ quantity: 4, minQuantity: 5 });
  });

  /**
   * Duong BINH THUONG cua phan lon dai ly cung phai co ban ghi: khong co no thi cau hoi "vi sao
   * dai ly nay khong duoc gia rieng" chi tra loi duoc bang cach mo DB doan.
   */
  it('khong co deal -> van phat mot ban ghi, outcome `allowed` chu khong phai suy giam', async () => {
    const sink = await dispatch({ overrides: [], quantity: 2 });
    const decision = dealerPriceDecisions(sink)[0]!;
    expect(decision.reason).toBe('DEALER_PRICE_BASE_NO_OVERRIDE');
    expect(decision.outcome).toBe('allowed');
    expect(decision.detail).toMatchObject({ overrideId: null, priceSource: 'base_wholesale' });
  });
});
