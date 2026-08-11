import { loadEnv } from '@netviet/shared';
import { tenantPersona } from '@netviet/tenant';

/**
 * Ten dung de BOC @mention khoi noi dung tin den.
 *
 * Nguon su that la GOI KHACH (`persona.mentionName`). Truoc Dot B1 gia tri nay la mac dinh cung
 * trong `envSchema` (`BOT_NAME = 'Bot ultty AI orders'`), tuc nhan dung chung mang san ten bot cua
 * MOT khach — them khach thu hai la phai sua schema env.
 *
 * `BOT_NAME` van con, nhung doi vai tro: tu "nguon" thanh "duong GHI DE theo moi truong chay"
 * (vd nhom test dung mot ten bot khac voi production cua chinh khach do).
 */
export function resolveBotName(): string {
  return loadEnv().BOT_NAME ?? tenantPersona().mentionName;
}
