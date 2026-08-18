import { describe, expect, it } from 'vitest';
import { EnvValidationError, envSchema, loadEnv } from '@netviet/shared';

describe('PARSER_MODE=deepseek', () => {
  it('thieu DEEPSEEK_API_KEY -> fail-fast luc khoi dong, KHONG am tham roi ve FakeParser', () => {
    expect(() => loadEnv({ PARSER_MODE: 'deepseek' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ PARSER_MODE: 'deepseek' })).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('co khoa -> qua cua binh thuong', () => {
    const env = loadEnv({ PARSER_MODE: 'deepseek', DEEPSEEK_API_KEY: 'sk-test' });
    expect(env.PARSER_MODE).toBe('deepseek');
  });

  it('DEEPSEEK_MODEL mac dinh la deepseek-v4-flash', () => {
    expect(envSchema.parse({}).DEEPSEEK_MODEL).toBe('deepseek-v4-flash');
  });

  it('doi model duoc bang bien moi truong', () => {
    expect(envSchema.parse({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }).DEEPSEEK_MODEL).toBe(
      'deepseek-v4-pro',
    );
  });

  it('du lieu khach that VAN bi chan khong cho dung deepseek (DeepSeek chua duoc duyet)', () => {
    expect(() =>
      loadEnv({
        DATA_CLASSIFICATION: 'customer',
        PARSER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'sk-test',
      }),
    ).toThrow(/PARSER_MODE/);
  });
});

describe('parser gia khong con la mot lua chon cua cau hinh', () => {
  it('PARSER_MODE=mock bi tu choi han — gia tri nay da bi go 18/08/2026', () => {
    expect(() => loadEnv({ PARSER_MODE: 'mock', DEEPSEEK_API_KEY: 'sk-test' })).toThrow(
      /PARSER_MODE/,
    );
  });

  it('chi con dung ba che do that', () => {
    for (const mode of ['claude', 'deepseek', 'flowise'] as const) {
      expect(envSchema.shape.PARSER_MODE.safeParse(mode).success).toBe(true);
    }
    expect(envSchema.shape.PARSER_MODE.safeParse('mock').success).toBe(false);
  });
});
