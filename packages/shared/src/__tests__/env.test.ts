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

  it('mac dinh CHANNEL_MODE=mock (offline, khong can dang nhap Zalo)', () => {
    const env = loadEnv({});

    expect(env.CHANNEL_MODE).toBe('mock');
    expect(env.ZALO_SELF_LISTEN).toBe('off');
    expect(env.ZALO_CRED_PATH).toContain('zalo-cred.json');
  });

  it('nhan CHANNEL_MODE=zca cho kenh thu vien ngoai', () => {
    const env = loadEnv({ CHANNEL_MODE: 'zca' });

    expect(env.CHANNEL_MODE).toBe('zca');
  });

  it('tuong thich nguoc: BOT_MODE=on (chua dat CHANNEL_MODE) -> suy ra kenh bot', () => {
    const env = loadEnv({ BOT_MODE: 'on' });

    expect(env.CHANNEL_MODE).toBe('bot');
  });

  it('CHANNEL_MODE dat tuong minh thang BOT_MODE (khong bi suy ra de)', () => {
    const env = loadEnv({ BOT_MODE: 'on', CHANNEL_MODE: 'zca' });

    expect(env.CHANNEL_MODE).toBe('zca');
  });

  it('CHANNEL_MODE=mock tuong minh + BOT_MODE=on -> GIU mock (khong bi suy ra bot)', () => {
    const env = loadEnv({ BOT_MODE: 'on', CHANNEL_MODE: 'mock' });

    expect(env.CHANNEL_MODE).toBe('mock');
  });

  it('nem loi khi CHANNEL_MODE khong hop le', () => {
    expect(() => loadEnv({ CHANNEL_MODE: 'userbot' })).toThrowError(EnvValidationError);
  });
});
