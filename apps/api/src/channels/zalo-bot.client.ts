/**
 * Client Zalo Bot Platform (tai dung tu tools/poc-zalo-bot da kiem chung PoC 07/07).
 * getUpdates rảnh tra HTTP 408 -> coi la idle (khong phai loi).
 */
const BOT_API_BASE = 'https://bot-api.zaloplatforms.com';

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

/** Phan tin duoc trich dan lai — cung hinh dang voi `message`, khong long them mot cap nua. */
export interface BotQuotedMessage {
  message_id?: string;
  text?: string;
  caption?: string;
  photo_url?: string;
  date?: number;
  from?: { id?: string; display_name?: string; is_bot?: boolean };
}

export interface BotUpdate {
  event_name?: string;
  message?: {
    message_id?: string;
    text?: string;
    caption?: string;
    photo_url?: string;
    date?: number;
    from?: { id?: string; display_name?: string; is_bot?: boolean };
    chat?: { id?: string; chat_type?: string };
    /**
     * ⚠️ CHUA KIEM CHUNG TREN ZALO THAT: runtime dang khoa `CHANNEL_MODE=mock` nen chua co ban
     * ghi update that nao de doi chieu ten truong. Doc theo kieu PHONG THU — thieu truong thi
     * `replyTo` la undefined va hanh vi y het truoc day (khong co ngu canh -> khong auto-confirm).
     * Khi bat kenh that, log mot update co trich dan roi doi lai ten neu Zalo dung ten khac.
     */
    reply_to_message?: BotQuotedMessage;
  };
}

export async function callBotApi<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown> = {},
  timeoutMs = 45_000,
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
    return { ok: false, error_code: response.status, description: text.slice(0, 200) };
  }
}

export function normalizeUpdates(result: unknown): BotUpdate[] {
  if (Array.isArray(result)) return result as BotUpdate[];
  if (result && typeof result === 'object') return [result as BotUpdate];
  return [];
}
