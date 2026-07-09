import { z } from 'zod';

/**
 * Schema bien moi truong dung chung cho toan he thong.
 * Nguyen tac (CLAUDE.md - Luu y bao mat): khong hardcode secret,
 * validate ngay khi khoi dong, fail fast voi thong bao ro rang.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://ultty:ultty_local@localhost:5432/ultty'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Lop luu tru don/tin: memory (in-memory, MAC DINH — demo/CI khong can DB) | prisma (Postgres).
  // Tach RIENG khoi DATABASE_URL (vi .env da co URL cho docker) -> bat Prisma phai CHU DONG dat = prisma.
  PERSISTENCE: z.enum(['memory', 'prisma']).default('memory'),
  // De trong duoc o local; cac module dung den (parser, bot) tu kiem tra khi bat.
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  ZALO_BOT_TOKEN: z.string().optional(),
  ZALO_BOT_WEBHOOK_SECRET: z.string().optional(),
  // Che do parser: mock (tat dinh) | claude (Anthropic) | deepseek (DeepSeek, tuong thich OpenAI).
  PARSER_MODE: z.enum(['mock', 'claude', 'deepseek']).default('mock'),
  // KENH ZALO — nguon su that DUY NHAT chon kenh doc/gui tin:
  //   mock  = offline (demo qua /demo/simulate) — mac dinh, khong can dang nhap Zalo.
  //   bot   = Zalo Bot Platform chinh thuc (can ZALO_BOT_TOKEN) — CHI nhan tin @mention.
  //   zca   = thu vien ngoai zca-js (userbot tai khoan ca nhan) — doc MOI tin nhom, khong can tag.
  // Luu y: zca vi pham ToS Zalo, co the bi khoa tai khoan -> dung TAI KHOAN PHU + can van ban
  // chap nhan rui ro cua khach (xem CLAUDE.md muc "Kenh Zalo").
  CHANNEL_MODE: z.enum(['mock', 'bot', 'zca']).default('mock'),
  // Bat/tat worker doc tin Zalo Bot (Bot Platform). GIU cho tuong thich nguoc: neu CHANNEL_MODE
  // khong dat nhung BOT_MODE=on thi loadEnv suy ra CHANNEL_MODE='bot'. Mac dinh off.
  BOT_MODE: z.enum(['on', 'off']).default('off'),
  // Duong dan file luu PHIEN dang nhap zca-js (cookie + imei + userAgent) sau khi quet QR lan dau,
  // de cac lan sau tu dang nhap lai khong can quet. Cred = session token -> bao mat nhu secret,
  // KHONG commit (da gitignore thu muc secrets/).
  ZALO_CRED_PATH: z.string().default('./secrets/zalo-cred.json'),
  // Nghe ca tin do CHINH tai khoan zca gui (message.isSelf). Mac dinh off de tranh vong lap
  // (bot gui xac nhan -> lai doc chinh no) + giam nhieu.
  ZALO_SELF_LISTEN: z.enum(['on', 'off']).default('off'),
  // Auto-ack: bot tu nhan "da ghi nhan" khi intent=Khac (LLM khong hieu). Mac dinh off
  // (GD1: AI khong tu tra loi nhom) — chi bat khi khach dong y cho bot nhan tin.
  AUTO_ACK: z.enum(['on', 'off']).default('off'),
  // Auto-send (GD2): AI TU CHOT + gui xac nhan don vao nhom, KHONG can Sale duyet — CHI khi
  // Giam sat khong phat hien rui ro (riskLevel='none'); co van de -> giu Sale duyet. Mac dinh
  // off theo GD1 (CLAUDE.md: AI khong tu gui khi CHUA co van ban dong y cua khach).
  AUTO_SEND: z.enum(['on', 'off']).default('off'),
  // Ten bot de boc @mention khoi noi dung tin.
  BOT_NAME: z.string().default('Bot ultty AI orders'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Broadcast (KH2): gian cach giua 2 lan gui de tranh vuot rate-limit Zalo (chua cong bo).
  BROADCAST_THROTTLE_MS: z.coerce.number().int().nonnegative().default(1500),
  // Tran so nhom moi lan gui — chan blast nham vao qua nhieu nhom.
  BROADCAST_MAX_TARGETS: z.coerce.number().int().positive().default(50),
  // Streaming 6 agent qua SSE. on -> frontend dung /events real-time; off -> quay ve polling (luoi an toan demo).
  STREAM_MODE: z.enum(['on', 'off']).default('on'),
  // Gian nhe giua cac buoc rules (tuc thi) cho de nhin. Router van co do tre THAT (LLM). 0 = thuan real.
  STREAM_STEP_DELAY_MS: z.coerce.number().int().nonnegative().default(280),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Bien moi truong khong hop le:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvValidationError(issues);
  }
  const data = result.data;
  // Tuong thich nguoc: cau hinh cu chi co BOT_MODE=on (chua biet CHANNEL_MODE) -> coi la kenh 'bot'.
  if (source.CHANNEL_MODE === undefined && data.BOT_MODE === 'on' && data.CHANNEL_MODE === 'mock') {
    return { ...data, CHANNEL_MODE: 'bot' };
  }
  return data;
}
