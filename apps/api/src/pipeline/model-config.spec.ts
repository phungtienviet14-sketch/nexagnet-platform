import { describe, expect, it, vi } from 'vitest';
import { envSchema } from '@netviet/shared';
import { ClaudeAdvisorAgent } from '../advisor/advisor-agent.js';
import { ClaudeParser } from './claude-parser.js';

/** Env toi thieu de schema parse duoc; tung test chi them dung bien no quan tam. */
const BASE = { ANTHROPIC_API_KEY: 'sk-test' };

/** Doc doi so cua lan goi dau; nem ro neu chua he goi thay vi tra undefined. */
function firstCall(create: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const args = create.mock.calls[0]?.[0];
  if (!args) throw new Error('client.messages.create chua he duoc goi');
  return args as Record<string, unknown>;
}

describe('model LLM la cau hinh, khong phai hang so trong ma nguon', () => {
  it('PARSER_MODEL mac dinh la Sonnet 5 (khong con Haiku 4.5)', () => {
    const env = envSchema.parse(BASE);
    expect(env.PARSER_MODEL).toBe('claude-sonnet-5');
  });

  it('ADVICE_MODEL mac dinh la Opus 5 — cau chu gui cho khach doc', () => {
    const env = envSchema.parse(BASE);
    expect(env.ADVICE_MODEL).toBe('claude-opus-5');
  });

  it('dat lai duoc bang bien moi truong (duong dao nguoc tuc thi khi chi phi vuot du kien)', () => {
    const env = envSchema.parse({ ...BASE, PARSER_MODEL: 'claude-haiku-4-5-20251001' });
    expect(env.PARSER_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('chuoi rong bi tu choi, khong am tham gui model rong len API', () => {
    expect(() => envSchema.parse({ ...BASE, PARSER_MODEL: '   ' })).toThrow();
  });
});

describe('model duoc truyen xuong dung noi goi API', () => {
  it('ClaudeParser goi dung model duoc cau hinh', async () => {
    const parser = new ClaudeParser('sk-test', 'claude-opus-5');
    const create = vi.fn(async () => ({
      content: [{ type: 'tool_use', name: 'extract_order', input: { intent: 'khac' } }] as {
        type: string;
        name: string;
        input: Record<string, unknown>;
      }[],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    // @ts-expect-error — thay client that bang stub
    parser.client = { messages: { create } };

    await parser.parse({ text: 'a oi', products: [], glossary: [] });

    expect(firstCall(create)).toMatchObject({ model: 'claude-opus-5' });
  });

  it('ClaudeAdvisorAgent goi dung model duoc cau hinh', async () => {
    const advisor = new ClaudeAdvisorAgent('sk-test', 'claude-opus-5');
    const create = vi.fn(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Da anh nhe' }] as { type: string; text: string }[],
    }));
    // @ts-expect-error — thay client that bang stub
    advisor.client = { messages: { create } };

    await advisor.reply({
      customerText: 'con hang ko',
      tools: {
        knowledge: { products: () => [], prices: () => [], glossary: () => [] },
        resolved: { dealer: null, branch: null, groupName: null, senderType: 'unknown' },
        senderType: 'unknown',
        chatId: 'g1',
      },
    } as never);

    expect(firstCall(create)).toMatchObject({ model: 'claude-opus-5' });
  });
});
