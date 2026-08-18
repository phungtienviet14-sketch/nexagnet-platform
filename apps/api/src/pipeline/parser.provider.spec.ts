import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeParser } from './claude-parser.js';
import { DeepSeekParser } from './deepseek-parser.js';
import { parserProvider } from './parser.provider.js';

const factory = parserProvider as { useFactory: () => unknown };
const KEYS = ['PARSER_MODE', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'] as const;

describe('parserProvider', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('KHONG con duong nao tu cau hinh dan toi parser gia (18/08/2026)', () => {
    // Mac dinh moi la `deepseek`; thieu khoa thi nem, KHONG roi ve parser gia nhu truoc.
    expect(() => factory.useFactory()).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('PARSER_MODE=deepseek co key thi dung DeepSeekParser', () => {
    process.env.PARSER_MODE = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';

    expect(factory.useFactory()).toBeInstanceOf(DeepSeekParser);
  });

  it('PARSER_MODE=claude thieu ANTHROPIC_API_KEY phai fail-fast, khong roi ve parser gia', () => {
    process.env.PARSER_MODE = 'claude';

    expect(() => factory.useFactory()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('PARSER_MODE=claude co key thi dung ClaudeParser', () => {
    process.env.PARSER_MODE = 'claude';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    expect(factory.useFactory()).toBeInstanceOf(ClaudeParser);
  });
});
