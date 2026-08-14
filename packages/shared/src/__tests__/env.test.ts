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

  it('cau hinh cua so gom burst co gioi han va cho phep tat bang 0', () => {
    expect(loadEnv({}).MESSAGE_BURST_WINDOW_MS).toBe(1_200);
    expect(loadEnv({ MESSAGE_BURST_WINDOW_MS: '0' }).MESSAGE_BURST_WINDOW_MS).toBe(0);
    expect(() => loadEnv({ MESSAGE_BURST_WINDOW_MS: '10001' })).toThrowError(
      EnvValidationError,
    );
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

  it('nhan duong dan report golden eval do tenant mount ma khong hardcode default', () => {
    expect(loadEnv({}).GOLDEN_EVAL_REPORT_PATH).toBeUndefined();
    expect(loadEnv({ GOLDEN_EVAL_REPORT_PATH: '/run/tenant/golden-eval.json' }).GOLDEN_EVAL_REPORT_PATH).toBe(
      '/run/tenant/golden-eval.json',
    );
  });

  it('mac dinh parser=mock, bot=off de demo chay khong can key/token', () => {
    const env = loadEnv({});

    expect(env.PARSER_MODE).toBe('mock');
    expect(env.BOT_MODE).toBe('off');
    expect(env.DATA_CLASSIFICATION).toBe('test');
    // Dot B1: ten bot la cua TUNG KHACH -> nhan dung chung khong mang mac dinh nao. Nguon that su
    // la goi khach (`persona.mentionName`, xem apps/api/src/channels/bot-name.ts); bien nay chi con
    // la duong GHI DE theo moi truong chay.
    expect(env.BOT_NAME).toBeUndefined();
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

  // --- AUTH_MODE: cong tac tat/bat xac thuc cho VM dev/demo ---

  it('mac dinh AUTH_MODE=api-key (khong tu dong tat xac thuc)', () => {
    expect(loadEnv({}).AUTH_MODE).toBe('api-key');
  });

  it('AUTH_MODE=none cho phep production chay KHONG can API_KEY (moi truong dev/demo)', () => {
    const env = loadEnv({ NODE_ENV: 'production', AUTH_MODE: 'none' });

    expect(env.AUTH_MODE).toBe('none');
    expect(env.API_KEY).toBeUndefined();
  });

  it('AUTH_MODE=none cho phep bat AdminJS ma khong can credential manh (panel khong doi dang nhap)', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', AUTH_MODE: 'none', ADMIN_UI: 'on' }),
    ).not.toThrow();
  });

  it('AUTH_MODE khong hop le -> nem loi thay vi am tham tat xac thuc', () => {
    expect(() => loadEnv({ AUTH_MODE: 'off' })).toThrowError(EnvValidationError);
  });

  it('AUTH_MODE=session bat buoc co secret va chi dung MemoryStore trong test/dev', () => {
    expect(() => loadEnv({ AUTH_MODE: 'session' })).toThrowError(EnvValidationError);
    expect(
      loadEnv({ AUTH_MODE: 'session', SESSION_SECRET: 's'.repeat(48) }).AUTH_MODE,
    ).toBe('session');
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'session',
        SESSION_SECRET: 's'.repeat(48),
        PERSISTENCE: 'memory',
      }),
    ).toThrowError(EnvValidationError);
  });

  it('customer readiness accepts cookie sessions and still forbids none', () => {
    const customer = {
      DATA_CLASSIFICATION: 'customer',
      PARSER_MODE: 'claude',
      ANTHROPIC_API_KEY: 'anthropic-key',
      PERSISTENCE: 'prisma',
      AUTH_MODE: 'session',
      SESSION_SECRET: 's'.repeat(48),
    } as const;

    expect(loadEnv(customer).AUTH_MODE).toBe('session');
    expect(() => loadEnv({ ...customer, AUTH_MODE: 'none' })).toThrowError(EnvValidationError);
  });

  // --- DATA_CLASSIFICATION: gate du lieu khach that ---

  it('du lieu khach that bat buoc dung Claude + Anthropic key', () => {
    const base = {
      DATA_CLASSIFICATION: 'customer',
      PERSISTENCE: 'prisma',
      AUTH_MODE: 'api-key',
      API_KEY: 'x'.repeat(32),
    } as const;

    expect(() => loadEnv({ ...base, PARSER_MODE: 'mock' })).toThrowError(EnvValidationError);
    expect(() => loadEnv({ ...base, PARSER_MODE: 'deepseek', DEEPSEEK_API_KEY: 'deepseek-key' })).toThrowError(
      EnvValidationError,
    );
    expect(() => loadEnv({ ...base, PARSER_MODE: 'claude' })).toThrowError(EnvValidationError);
    expect(loadEnv({ ...base, PARSER_MODE: 'claude', ANTHROPIC_API_KEY: 'anthropic-key' }).PARSER_MODE).toBe(
      'claude',
    );
  });

  it('du lieu khach that bat buoc persistence prisma va auth khong duoc none', () => {
    const safe = {
      DATA_CLASSIFICATION: 'customer',
      PARSER_MODE: 'claude',
      ANTHROPIC_API_KEY: 'anthropic-key',
      API_KEY: 'x'.repeat(32),
    } as const;

    expect(() => loadEnv({ ...safe, PERSISTENCE: 'memory' })).toThrowError(EnvValidationError);
    expect(() => loadEnv({ ...safe, PERSISTENCE: 'prisma', AUTH_MODE: 'none' })).toThrowError(
      EnvValidationError,
    );
    expect(loadEnv({ ...safe, PERSISTENCE: 'prisma', AUTH_MODE: 'api-key' }).DATA_CLASSIFICATION).toBe(
      'customer',
    );
  });

  it('du lieu khach that + kenh Zalo that khong duoc MEDIA_STORE=none', () => {
    const base = {
      DATA_CLASSIFICATION: 'customer',
      PARSER_MODE: 'claude',
      ANTHROPIC_API_KEY: 'anthropic-key',
      PERSISTENCE: 'prisma',
      AUTH_MODE: 'api-key',
      API_KEY: 'x'.repeat(32),
    } as const;

    expect(() => loadEnv({ ...base, CHANNEL_MODE: 'bot', ZALO_BOT_TOKEN: 'bot-token-test' })).toThrowError(
      EnvValidationError,
    );
    expect(
      loadEnv({
        ...base,
        CHANNEL_MODE: 'bot',
        ZALO_BOT_TOKEN: 'bot-token-test',
        MEDIA_STORE: 'local',
      }).MEDIA_STORE,
    ).toBe('local');
  });
});
