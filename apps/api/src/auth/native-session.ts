import { createHmac } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * PHIEN DANG NHAP CHO UNG DUNG NATIVE — CUNG MOT PHIEN, KHAC CACH MANG (#394).
 *
 * ============================================================================================
 * VAN DE
 * ============================================================================================
 *
 * Xac thuc nguoi dung co DUNG MOT su that: phien `express-session` luu o bang `Session`, cookie
 * `s:<sid>.<HMAC>` da ky bang `SESSION_SECRET`, va `SessionAuthGuard` doc lai `User` moi yeu cau
 * de doi chieu `credentialVersion`. Ung dung Android/iOS can:
 *
 *   · cat bi mat phien trong Keychain/Keystore (`expo-secure-store`) — khong phai trong kho cookie
 *     cua he dieu hanh, noi ung dung khong chon duoc lop bao ve;
 *   · gui no tu tac vu nen (bam vi tri) va tu trinh tai tep, noi kho cookie khong chac dung chung;
 *   · phan biet "het phien" (401) voi "khong co quyen" (403). Qua cookie, mot token CSRF het han
 *     tra 403 y het mot lan bi tu choi quyen — va hang doi ngoai tuyen (`@netviet/driver-outbox`)
 *     coi 403 la tu choi VINH VIEN, tuc bang chung that bi gac lai sai.
 *
 * ============================================================================================
 * CACH GIAI: DOI CACH MANG, KHONG DOI SU THAT
 * ============================================================================================
 *
 * Mot yeu cau TU XUNG la native (`Authorization: Bearer <token>` hoac `X-Nexagnet-Client`) duoc
 * phuc vu KHONG CO COOKIE nao ca:
 *
 *   · cookie gui den bi BO; neu co bearer, token do duoc dat vao cho cookie phien de CHINH
 *     express-session kiem chu ky HMAC va nap dung hang `Session`. Bearer sai hinh dang -> xoa
 *     cookie -> 401. Khong co duong thu hai de xac minh token;
 *   · `Set-Cookie` cua phien bi CHAN o phan hoi, de kho cookie cua he dieu hanh khong am tham giu
 *     mot ban sao thu hai cua bi mat.
 *
 * Vi yeu cau do khong mang thong tin dang nhap NGAM nao (trinh duyet khong tu dinh kem
 * `Authorization`, va cookie da bi bo), CSRF — thu bao ve thong tin dang nhap ngam — khong con gi
 * de bao ve: `CsrfGuard` cho qua dung loai yeu cau nay. Moi thu khac GIU NGUYEN: cung hang
 * `Session`, cung han truot 8 gio, cung phep thu hoi bang `credentialVersion`, cung doc lai vai tro
 * moi yeu cau, cung `logout` huy phien. Khong co bang moi, khong co bi mat moi, khong co vai tro moi.
 *
 * Token CHI duoc cap doi lay MAT KHAU (`NativeSessionController`), khong bao gio doi lay mot phien
 * cookie dang co: neu doi duoc, mot lo XSS tren web se bien cookie HttpOnly thanh mot chuoi doc
 * duoc.
 */

/** Tieu de ma ung dung native gui kem MOI yeu cau, ke ca luc chua dang nhap. */
export const NATIVE_CLIENT_HEADER = 'x-nexagnet-client';

/**
 * Hinh dang cua gia tri cookie phien da ky: `s:` + sid (uid-safe, base64url) + `.` + HMAC-SHA256
 * base64 bo dau `=` (43 ky tu). Chi de loai rac som — chu ky van do express-session kiem.
 */
const SESSION_TOKEN_SHAPE = /^s:[A-Za-z0-9_-]{16,128}\.[A-Za-z0-9+/]{43}$/;

/** Dau "yeu cau nay la native". Symbol cuc bo — than yeu cau khong mao danh duoc (xem INTERNAL_MARK). */
const NATIVE_MARK = Symbol('netviet.nativeClient');

type MarkableRequest = Record<PropertyKey, unknown>;

/** Yeu cau nay duoc phuc vu theo che do native (khong cookie). `CsrfGuard` doc ham nay. */
export function isNativeClientRequest(request: unknown): boolean {
  return (request as MarkableRequest | null)?.[NATIVE_MARK] === true;
}

/**
 * Ky sid thanh gia tri cookie phien — DUNG dinh dang express-session dung (`cookie-signature`):
 * `s:` + sid + `.` + base64(HMAC-SHA256(sid, secret)) bo dau `=`. Bai round-trip trong
 * `native-session.spec.ts` chay qua express-session THAT, nen neu dinh dang do doi, bai do do.
 */
export function signSessionToken(sessionId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(sessionId).digest('base64').replace(/=+$/, '');
  return `s:${sessionId}.${mac}`;
}

/** `undefined` = khong co bearer. Chuoi rong/sai dang VAN tra ve de bi tu choi, khong bi bo qua. */
function readBearer(header: string | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer(?:\s+(.*))?$/i.exec(header.trim());
  return match ? (match[1] ?? '').trim() : undefined;
}

/**
 * Chan `Set-Cookie` cua phien tren phan hoi nay. express-session (qua `on-headers`) va
 * `res.clearCookie` deu di qua `setHeader`, nen chan o day la chan ca hai.
 */
function suppressSessionCookie(response: Response, cookieName: string): void {
  const setHeader = response.setHeader.bind(response);
  const prefix = `${cookieName}=`;
  response.setHeader = ((name: string, value: number | string | readonly string[]) => {
    if (name.toLowerCase() !== 'set-cookie') return setHeader(name, value);
    const values = (Array.isArray(value) ? value : [String(value)]) as string[];
    const kept = values.filter((cookie) => !cookie.startsWith(prefix));
    if (kept.length === 0) {
      response.removeHeader('Set-Cookie');
      return response;
    }
    return setHeader(name, kept);
  }) as Response['setHeader'];
}

/**
 * Middleware PHAI dang ky TRUOC `express-session` — no sua `req.headers.cookie` truoc khi
 * express-session doc no.
 */
export function nativeSessionCarrier(cookieName: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const bearer = readBearer(request.headers.authorization);
    const declaresNative = request.headers[NATIVE_CLIENT_HEADER] !== undefined;
    if (bearer === undefined && !declaresNative) {
      next();
      return;
    }
    (request as unknown as MarkableRequest)[NATIVE_MARK] = true;
    if (bearer !== undefined && SESSION_TOKEN_SHAPE.test(bearer)) {
      request.headers.cookie = `${cookieName}=${encodeURIComponent(bearer)}`;
    } else {
      delete request.headers.cookie;
    }
    suppressSessionCookie(response, cookieName);
    next();
  };
}
