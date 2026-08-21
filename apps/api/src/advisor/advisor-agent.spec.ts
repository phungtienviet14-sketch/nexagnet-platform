import { describe, expect, it, vi } from 'vitest';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ClaudeAdvisorAgent, buildAdvisorSystem, type AdvisorRequest } from './advisor-agent.js';

/**
 * Vong lap cong cu cua agent tu van. Client Anthropic duoc thay bang stub — khong goi mang.
 *
 * Ba dieu duoc khoa o day:
 *  1. LLM goi duoc cong cu va NHAN LAI ket qua that tu nguon su that (khong phai prompt nhoi san).
 *  2. Con so tien LLM viet ra phai la con so cong cu tra ve; bia ra thi ban soan BI BO.
 *  3. Hong/tu choi/het vong deu tra `null` — ben goi luon con duong tat dinh de lui ve.
 */

const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));

function request(overrides: Partial<AdvisorRequest> = {}): AdvisorRequest {
  return {
    customerText: 'ghe felix bao nhieu tien c oi',
    tools: {
      knowledge,
      resolved: { dealer: null, branch: null, groupName: null, senderType: 'dai_ly' },
      senderType: 'dai_ly',
      chatId: 'g1',
    },
    ...overrides,
  } as AdvisorRequest;
}

/** Stub tra ve lan luot cac response da dung san. */
function stub(agent: ClaudeAdvisorAgent, responses: unknown[]) {
  const create = vi.fn(async () => responses.shift());
  // @ts-expect-error — thay client that bang stub
  agent.client = { messages: { create } };
  return create;
}

const toolUse = (name: string, input: Record<string, unknown>) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu_1', name, input }],
});

const text = (value: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: value }],
});

describe('ClaudeAdvisorAgent — vong lap cong cu', () => {
  it('goi cong cu, nhan ket qua that, roi tu viet cau tra loi', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    const sku = knowledge.products()[0]!.sku;
    const price = knowledge.prices().find((row) => row.sku === sku)!.wholesale;
    const create = stub(agent, [
      toolUse('bao_gia', { skus: [sku] }),
      text(`Dạ bên em ${price.toLocaleString('vi-VN')}đ ạ.`),
    ]);

    const reply = await agent.reply(request());

    expect(reply?.text).toContain('ạ');
    expect(reply?.usedTools).toEqual(['bao_gia']);
    // Luot thu hai phai mang theo tool_result cua luot dau — khong co no thi LLM viet trong tri nho.
    const secondCall = create.mock.calls[1] as unknown as [{ messages: { role: string; content: unknown }[] }];
    const secondTurn = secondCall[0];
    const lastMessage = secondTurn.messages.at(-1)!;
    expect(lastMessage.role).toBe('user');
    expect(JSON.stringify(lastMessage.content)).toContain(String(price));
  });

  it('BO ban soan khi LLM bia mot con so tien khong cong cu nao tra ve', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    const sku = knowledge.products()[0]!.sku;
    stub(agent, [toolUse('bao_gia', { skus: [sku] }), text('Dạ bên em 123.456đ ạ.')]);

    expect(await agent.reply(request())).toBeNull();
  });

  it('khong goi cong cu nao ma van noi gia -> BO ban soan', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    stub(agent, [text('Dạ ghế Felix 1.150.000đ ạ.')]);

    expect(await agent.reply(request())).toBeNull();
  });

  it('cau tra loi khong co con so tien thi di qua binh thuong', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    stub(agent, [text('Dạ máy hút được cả sàn gỗ ạ.')]);

    expect((await agent.reply(request()))?.text).toBe('Dạ máy hút được cả sàn gỗ ạ.');
  });

  it('nhan dau CHUYEN_SALE va boc no khoi van ban gui cho khach', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    stub(agent, [text('Dạ em nhờ Sale kiểm tra rồi báo lại mình ngay ạ. [CHUYEN_SALE]')]);

    const reply = await agent.reply(request());

    expect(reply?.handoff).toBe(true);
    expect(reply?.text).not.toContain('CHUYEN_SALE');
  });

  it('LLM tu choi -> null, ben goi lui ve duong tat dinh', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    stub(agent, [{ stop_reason: 'refusal', content: [] }]);

    expect(await agent.reply(request())).toBeNull();
  });

  it('loi mang -> null, khong nem len pipeline', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    // @ts-expect-error — thay client that bang stub
    agent.client = {
      messages: {
        create: async () => {
          throw new Error('mang hong');
        },
      },
    };

    expect(await agent.reply(request())).toBeNull();
  });

  it('goi cong cu mai khong chiu ket luan -> dung lai, khong treo', async () => {
    const agent = new ClaudeAdvisorAgent('sk-test');
    const sku = knowledge.products()[0]!.sku;
    const create = stub(
      agent,
      Array.from({ length: 10 }, () => toolUse('tra_cuu_san_pham', { tu_khoa: sku })),
    );

    expect(await agent.reply(request())).toBeNull();
    expect(create.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

describe('prompt cache cua agent tu van', () => {
  it('phan TINH giong het nhau cho hai nhom khac nhau — dieu kien de cache chay', () => {
    const a = buildAdvisorSystem(request({ senderDisplayName: 'Lan' }));
    const b = buildAdvisorSystem(
      request({
        senderDisplayName: 'Hung',
        tools: {
          knowledge,
          resolved: { dealer: null, branch: null, groupName: null, senderType: 'ctv' },
          senderType: 'ctv',
          chatId: 'g2',
        },
      }),
    );

    expect(a[0]!.text).toBe(b[0]!.text);
    expect(a[0]!.cache_control).toEqual({ type: 'ephemeral' });
    // Phan bien dong phai KHAC nhau, neu khong thi danh tinh nguoi hoi da lot vao phan tinh.
    expect(a[1]!.text).not.toBe(b[1]!.text);
  });
});
