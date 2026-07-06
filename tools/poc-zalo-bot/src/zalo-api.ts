import { BOT_API_BASE } from './config.js';

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  [key: string]: unknown;
}

/**
 * Goi mot method cua Zalo Bot API.
 * Tai lieu: https://bot.zapps.me/docs/call-api/
 */
export async function callBotApi<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown> = {},
  timeoutMs = 40_000,
): Promise<BotApiResponse<T>> {
  const url = `${BOT_API_BASE}/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as BotApiResponse<T>;
  } catch {
    return {
      ok: false,
      error_code: response.status,
      description: `Phan hoi khong phai JSON (HTTP ${response.status}): ${text.slice(0, 300)}`,
    };
  }
}

export interface BotUpdate {
  event_name?: string;
  message?: {
    message_id?: string;
    text?: string;
    date?: number;
    from?: { id?: string; display_name?: string; is_bot?: boolean };
    chat?: { id?: string; chat_type?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Chuan hoa result cua getUpdates ve mang (phong khi API tra 1 object don le). */
export function normalizeUpdates(result: unknown): BotUpdate[] {
  if (Array.isArray(result)) return result as BotUpdate[];
  if (result && typeof result === 'object') return [result as BotUpdate];
  return [];
}
