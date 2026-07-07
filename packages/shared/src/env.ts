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
  // De trong duoc o local; cac module dung den (parser, bot) tu kiem tra khi bat.
  ANTHROPIC_API_KEY: z.string().optional(),
  ZALO_BOT_TOKEN: z.string().optional(),
  ZALO_BOT_WEBHOOK_SECRET: z.string().optional(),
  // Che do parser: mock (tat dinh, demo offline) hoac claude (that).
  PARSER_MODE: z.enum(['mock', 'claude']).default('mock'),
  // Bat/tat worker doc tin Zalo Bot. Mac dinh off de app boot khong can token.
  BOT_MODE: z.enum(['on', 'off']).default('off'),
  // Ten bot de boc @mention khoi noi dung tin.
  BOT_NAME: z.string().default('Bot ultty AI orders'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
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
  return result.data;
}
