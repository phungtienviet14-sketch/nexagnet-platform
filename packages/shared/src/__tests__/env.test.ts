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

  it('nhan cau hinh Flowise day du va ep timeout sang so', () => {
    const env = loadEnv({
      PARSER_MODE: 'flowise',
      FLOWISE_BASE_URL: 'http://flowise:3000',
      FLOWISE_FLOW_ID: 'zalo-order-parser-v1',
      FLOWISE_API_KEY: 'flowise-secret-key',
      FLOWISE_TIMEOUT_MS: '45000',
    });

    expect(env.PARSER_MODE).toBe('flowise');
    expect(env.FLOWISE_BASE_URL).toBe('http://flowise:3000');
    expect(env.FLOWISE_FLOW_ID).toBe('zalo-order-parser-v1');
    expect(env.FLOWISE_TIMEOUT_MS).toBe(45_000);
  });

  it('PARSER_MODE=flowise thieu cau hinh -> fail fast, khong roi ve mock', () => {
    expect(() => loadEnv({ PARSER_MODE: 'flowise' })).toThrowError(EnvValidationError);

    try {
      loadEnv({ PARSER_MODE: 'flowise' });
    } catch (error) {
      const validationError = error as EnvValidationError;
      const issues = validationError.issues.join('\n');
      expect(issues).toContain('FLOWISE_BASE_URL');
      expect(issues).toContain('FLOWISE_FLOW_ID');
      expect(issues).toContain('FLOWISE_API_KEY');
    }
  });

  it('mac dinh CHANNEL_MODE=mock (offline, khong can dang nhap Zalo)', () => {
    const env = loadEnv({});

    expect(env.CHANNEL_MODE).toBe('mock');
    expect(env.ZALO_SELF_LISTEN).toBe('off');
    expect(env.ZALO_CRED_PATH).toContain('zalo-cred.json');
    expect(env.ZALO_ALLOWED_GROUPS_PATH).toContain('zalo-allowed-groups.json');
  });

  it('nhan CHANNEL_MODE=zca cho kenh thu vien ngoai', () => {
    const env = loadEnv({ CHANNEL_MODE: 'zca' });

    expect(env.CHANNEL_MODE).toBe('zca');
  });

  it('nhan CHANNEL_MODE=hybrid khi co token Bot Platform', () => {
    const env = loadEnv({ CHANNEL_MODE: 'hybrid', ZALO_BOT_TOKEN: 'bot-token-test' });

    expect(env.CHANNEL_MODE).toBe('hybrid');
  });

  it('CHANNEL_MODE=hybrid thieu token Bot Platform -> fail fast', () => {
    expect(() => loadEnv({ CHANNEL_MODE: 'hybrid' })).toThrowError(EnvValidationError);
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

  // --- API_KEY: chan viec deploy production ma quen khoa API ---

  it('mac dinh (khong production) KHONG can API_KEY -> demo/CI chay nhu cu', () => {
    const env = loadEnv({});

    expect(env.API_KEY).toBeUndefined();
  });

  it('NODE_ENV=production ma THIEU API_KEY -> nem loi ngay luc khoi dong', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrowError(EnvValidationError);
  });

  it('NODE_ENV=production + co API_KEY -> hop le', () => {
    const apiCredentialFixture = 'x'.repeat(32);
    const env = loadEnv({ NODE_ENV: 'production', API_KEY: apiCredentialFixture });

    expect(env.API_KEY).toBe(apiCredentialFixture);
  });

  it('production + CHANNEL_MODE=zca bat buoc co operator origin HTTPS', () => {
    const base = {
      NODE_ENV: 'production',
      API_KEY: 'x'.repeat(32),
      CHANNEL_MODE: 'zca',
    } as const;

    expect(() => loadEnv(base)).toThrowError(EnvValidationError);
    expect(() => loadEnv({ ...base, ZALO_OPERATOR_ORIGIN: 'http://operator.example.com' })).toThrowError(
      EnvValidationError,
    );
    expect(
      loadEnv({ ...base, ZALO_OPERATOR_ORIGIN: 'https://operator.example.com' }).ZALO_OPERATOR_ORIGIN,
    ).toBe('https://operator.example.com');
  });

  it('production + CHANNEL_MODE=hybrid cung bat buoc co operator origin HTTPS', () => {
    const base = {
      NODE_ENV: 'production',
      API_KEY: 'x'.repeat(32),
      CHANNEL_MODE: 'hybrid',
      ZALO_BOT_TOKEN: 'bot-token-test',
    } as const;

    expect(() => loadEnv(base)).toThrowError(EnvValidationError);
    expect(
      loadEnv({ ...base, ZALO_OPERATOR_ORIGIN: 'https://operator.example.com' })
        .ZALO_OPERATOR_ORIGIN,
    ).toBe('https://operator.example.com');
  });

  it('production khong cho bat AdminJS bang credential mac dinh hoac yeu', () => {
    const base = {
      NODE_ENV: 'production',
      API_KEY: 'x'.repeat(32),
      ADMIN_UI: 'on',
    } as const;

    expect(() => loadEnv(base)).toThrowError(EnvValidationError);
    expect(() =>
      loadEnv({
        ...base,
        ADMIN_PASSWORD: 'mot-mat-khau-du-dai-va-khac-default',
        ADMIN_COOKIE_SECRET: 'c'.repeat(48),
      }),
    ).not.toThrow();
  });

  it('API_KEY qua ngan -> nem loi (chan khoa doan duoc)', () => {
    expect(() => loadEnv({ API_KEY: 'ngan-qua' })).toThrowError(EnvValidationError);
  });
});
