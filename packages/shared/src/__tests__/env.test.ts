import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../env.js';

describe('loadEnv', () => {
  it('tra ve gia tri mac dinh cho moi truong local trong', () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.REDIS_URL).toContain('redis://');
  });

  it('ep kieu PORT tu chuoi sang so', () => {
    const env = loadEnv({ PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('nem EnvValidationError kem ten bien khi gia tri sai', () => {
    expect(() => loadEnv({ DATABASE_URL: 'khong-phai-url' })).toThrowError(EnvValidationError);
    try {
      loadEnv({ DATABASE_URL: 'khong-phai-url', PORT: '-1' });
    } catch (error) {
      const validationError = error as EnvValidationError;
      expect(validationError.issues.join('\n')).toContain('DATABASE_URL');
      expect(validationError.issues.join('\n')).toContain('PORT');
    }
  });

  it('khong yeu cau cac secret tuy chon o local', () => {
    const env = loadEnv({});

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ZALO_BOT_TOKEN).toBeUndefined();
  });

  it('mac dinh parser=mock, bot=off de demo chay khong can key/token', () => {
    const env = loadEnv({});

    expect(env.PARSER_MODE).toBe('mock');
    expect(env.BOT_MODE).toBe('off');
    expect(env.BOT_NAME).toContain('Bot');
  });
});
