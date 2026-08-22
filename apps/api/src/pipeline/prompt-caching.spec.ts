import { describe, expect, it, vi } from 'vitest';
import { ClaudeParser } from './claude-parser.js';
import { buildStaticPrompt, buildSystemPrompt, buildTurnContext } from './parser-prompt.js';
import type { ParserInput } from './order-parser.js';

const PERSONA = {
  parserIntro: 'Ban la tro ly cua mot cong ty gia dung.',
  botName: 'Tro ly',
  mentionName: '@troly',
  productFallbackDescription: 'san pham gia dung',
};

const INPUT: ParserInput = {
  text: 'lay 10 felix',
  products: [{ sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix'], unit: 'cái' }],
  glossary: [{ term: 'TN', meaning: 'Thái Nguyên' }],
  dealerNameRaw: 'Dai ly Kiem Thu XYZ',
  sentAt: new Date('2026-08-18T10:05:00.000Z'),
  context: {
    recentMessages: [
      {
        externalMessageId: 'm-1',
        text: 'con hang ko c',
        senderDisplayName: 'Dai ly Kiem Thu XYZ',
        senderRole: 'customer',
        sentAt: new Date('2026-08-18T10:00:00.000Z'),
      },
    ],
    participants: [],
  },
};

describe('tach prompt tinh / phan bien dong (dieu kien de prompt caching hoat dong)', () => {
  it('phan TINH chua danh muc SKU + glossary + dinh nghia intent', () => {
    const s = buildStaticPrompt(INPUT, PERSONA);
    expect(s).toContain('Ghế Felix');
    expect(s).toContain('TN=Thái Nguyên');
    expect(s).toContain('dat_don');
  });

  it('phan TINH KHONG duoc chua bat cu thu gi doi theo tung tin', () => {
    const s = buildStaticPrompt(INPUT, PERSONA);
    // Co mot trong hai thu nay trong phan tinh la cache vo hieu ngay tu tin thu hai.
    expect(s).not.toContain('Dai ly Kiem Thu XYZ');
    expect(s).not.toContain('con hang ko c');
  });

  it('phan TINH giong het nhau giua hai tin khac nhau cua hai nhom khac nhau', () => {
    const a = buildStaticPrompt(INPUT, PERSONA);
    const b = buildStaticPrompt(
      { ...INPUT, text: 'bao nhieu tien', dealerNameRaw: 'Amico SG', context: undefined },
      PERSONA,
    );
    expect(a).toBe(b);
  });

  it('phan BIEN DONG chua dai ly + lich su, khong lap lai danh muc SKU', () => {
    const turn = buildTurnContext(INPUT);
    expect(turn).toContain('Dai ly Kiem Thu XYZ');
    expect(turn).toContain('con hang ko c');
    expect(turn).not.toContain('Danh muc SKU');
  });

  it('khong co dai ly lan lich su -> phan bien dong rong', () => {
    expect(buildTurnContext({ ...INPUT, dealerNameRaw: undefined, context: undefined })).toBe('');
  });

  it('buildSystemPrompt van la tinh + bien dong (DeepSeek dung nguyen ban cu)', () => {
    const full = buildSystemPrompt(INPUT, PERSONA);
    expect(full).toContain('Ghế Felix');
    expect(full).toContain('Dai ly Kiem Thu XYZ');
    expect(full).toContain('con hang ko c');
  });
});

/** Doc mang `system` cua lan goi thu N; nem ro neu chua he goi (test hong thay vi undefined). */
function systemOf(
  create: { mock: { calls: unknown[][] } },
  index: number,
): { text: string; cache_control?: unknown }[] {
  const call = create.mock.calls[index]?.[0] as { system?: unknown } | undefined;
  const system = call?.system;
  if (!Array.isArray(system)) throw new Error(`Lan goi ${index} khong co mang system`);
  return system as { text: string; cache_control?: unknown }[];
}

describe('ClaudeParser gui prompt theo dang cache duoc', () => {
  function parserWithSpy() {
    const parser = new ClaudeParser('test-key');
    const create = vi.fn(async () => ({
      content: [{ type: 'tool_use', name: 'extract_order', input: { intent: 'hoi_gia' } }] as {
        type: string;
        name: string;
        input: Record<string, unknown>;
      }[],
      usage: { input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 0 },
    }));
    // @ts-expect-error — thay client that bang stub trong test
    parser.client = { messages: { create } };
    return { parser, create };
  }

  /*
   * Token doc tu cache phai NAM TRONG con so bao ra. Anthropic tra `input_tokens` KHONG gom
   * `cache_read_input_tokens`, nen chi lay `input_tokens` thi tu tin thu hai tro di trace se bao
   * mot prompt teo di dot ngot — dung luc prompt caching bat dau chay. Nguoi doc se tuong prompt
   * bi cat, trong khi that ra no van nguyen ven.
   */
  it('bao so token GOM ca phan doc tu cache', async () => {
    const parser = new ClaudeParser('test-key');
    const create = vi.fn(async () => ({
      content: [{ type: 'tool_use', name: 'extract_order', input: { intent: 'hoi_gia' } }],
      usage: { input_tokens: 310, output_tokens: 96, cache_read_input_tokens: 2_000 },
    }));
    // @ts-expect-error — thay client that bang stub trong test
    parser.client = { messages: { create } };
    const reported: unknown[] = [];

    await parser.parse({ ...INPUT, reportUsage: (u) => reported.push(u) });

    expect(reported).toEqual([{ inputTokens: 2_310, outputTokens: 96 }]);
  });

  it('system la MANG block, block tinh duoc danh dau cache_control ephemeral', async () => {
    const { parser, create } = parserWithSpy();

    await parser.parse(INPUT);

    const system = systemOf(create, 0);
    expect(system[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral' },
    });
    expect(system[0]?.text).toContain('Ghế Felix');
  });

  it('phan bien dong nam SAU diem cat cache, khong lam hong prefix', async () => {
    const { parser, create } = parserWithSpy();

    await parser.parse(INPUT);

    const system = systemOf(create, 0);
    // Dai ly + lich su phai o block sau; nam trong block dau la cache chet ngay tin thu hai.
    expect(system[0]?.text).not.toContain('Dai ly Kiem Thu XYZ');
    expect(JSON.stringify(system.slice(1))).toContain('Dai ly Kiem Thu XYZ');
  });

  it('block dau GIONG HET nhau giua hai tin cua hai nhom khac nhau', async () => {
    const { parser, create } = parserWithSpy();

    await parser.parse(INPUT);
    await parser.parse({ ...INPUT, text: 'con hang ko', dealerNameRaw: 'Amico SG' });

    const first = systemOf(create, 0)[0]?.text;
    const second = systemOf(create, 1)[0]?.text;
    expect(first).toBe(second);
  });
});
