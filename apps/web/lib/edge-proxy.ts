import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * KHOA ORIGIN cho ban web. Cung vai tro voi `edge-proxy.guard.ts` ben API, nhung o day khong co
 * NGOAI LE NAO — va do la mot khac biet co chu dich, khong phai thieu sot.
 *
 * Service web tren Northflank dung health check giao thuc TCP (mo duoc cong = song), khong phai
 * HTTP, nen khong he ton tai mot prober noi bo can duong di rieng. API thi nguoc lai: no giu ba
 * probe HTTP tren `/health`, nen ben do phai mien dung mot duong, va phai chung minh duoc rang
 * duong do khong voi toi tu Internet.
 *
 * Khong co ngoai le -> khong co gi de do. Neu sau nay ai do doi health check cua web sang HTTP thi
 * phai them ngoai le O DAY mot cach tuong minh, thay vi de san mot lo hong cho tuong lai.
 */
export const EDGE_PROXY_HEADER = 'x-nexagnet-edge-key';

/**
 * Ben API, `EDGE_PROXY_SECRET` di qua zod `.min(32)` nen mot gia tri rong hay qua ngan lam tien
 * trinh CHET NGAY luc khoi dong. Ben web khong co tang do, nen phai tu kiem — cung mot con so.
 */
export const EDGE_PROXY_MIN_SECRET_LENGTH = 32;

export type WebEdgeProxyReason =
  'EDGE_GUARD_DISABLED' | 'EDGE_KEY_MATCH' | 'EDGE_KEY_REJECTED' | 'EDGE_SECRET_MISCONFIGURED';

export interface WebEdgeProxyDecision {
  readonly allowed: boolean;
  readonly reason: WebEdgeProxyReason;
}

/**
 * PHAN BIET "khong dat" VOI "dat nham". Day la cho ban dau lam SAI.
 *
 * Ban dau mot chuoi rong bi coi nhu chua dat -> khoa TAT. Ly do luc do: coi chuoi rong la bi mat
 * that thi moi request deu 403 va "web chet ma khong ai hieu vi sao". Nhung danh doi do dat nham
 * huong: mot origin cong khai IM LANG mo toang te hon mot service chet ON AO. Nguoi van hanh go
 * `EDGE_PROXY_SECRET=` tren service web (con API thi dat dung) se khong thay mot dau hieu nao.
 *
 * Nay: `undefined` = CO Y khong khoa (stack sau Caddy, khong co origin cong khai) -> cho qua.
 * Dat nhung rong / toan trang / ngan hon 32 = CAU HINH HONG -> tu choi TAT CA, va log mot dong noi
 * thang ra van de. Fail-closed, va khong con im lang.
 *
 * Gop "thieu khoa" va "sai khoa" lam mot ly do: ben API tach hai de nguoi truc biet edge gui nham
 * khoa hay khong gui gi; ben web khong co nhu cau do.
 */
export function evaluateWebEdgeProxyRequest(
  rawSecret: string | undefined,
  providedKey: string | null | undefined,
): WebEdgeProxyDecision {
  if (rawSecret === undefined) return { allowed: true, reason: 'EDGE_GUARD_DISABLED' };
  const secret = rawSecret.trim();
  if (secret.length < EDGE_PROXY_MIN_SECRET_LENGTH) {
    return { allowed: false, reason: 'EDGE_SECRET_MISCONFIGURED' };
  }
  if (typeof providedKey === 'string' && matchesSecret(providedKey, secret)) {
    return { allowed: true, reason: 'EDGE_KEY_MATCH' };
  }
  return { allowed: false, reason: 'EDGE_KEY_REJECTED' };
}

/**
 * Bam SHA-256 truoc de hai buffer LUON cung do dai. `timingSafeEqual` nem loi khi do dai lech, va
 * ban than do dai da la mot manh thong tin ro ri.
 */
function matchesSecret(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Doc bi mat LUC CHAY.
 *
 * Bat buoc phai la middleware chay o runtime `nodejs`: o runtime `edge`, Next.js NHUNG CUNG cac
 * tham chieu `process.env.*` vao ban dung luc build. Bi mat khi do se bi dong bang tu luc build
 * (build khong he co no, nen se thanh `undefined` -> khoa im lang TAT), va bat ky gia tri nao co
 * mat luc build se nam thang trong artefact. Ca hai ket qua deu sai.
 */
// Nhan mot tui bien chung, KHONG phai `NodeJS.ProcessEnv`. Next.js boi them `NODE_ENV` thanh truong
// BAT BUOC cua `ProcessEnv`, nen lay ca kieu do se bat moi cho goi phai dung mot moi truong day du —
// ke ca bo test von chi muon noi ve mot bien duy nhat. Mot kieu chi co dung truong `EDGE_PROXY_SECRET`
// cung khong dung: `ProcessEnv` mang chi muc `[key: string]`, nen TS bao hai kieu khong co diem chung.
// `Record<string, string | undefined>` la cho ca `process.env` lan mot object test deu gan duoc.
export function readEdgeProxySecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  // Tra ve NGUYEN VAN, khong ep chuoi rong thanh `undefined`. Viec phan biet "chua dat" voi
  // "dat nham" thuoc ve `evaluateWebEdgeProxyRequest`; nuot mat su khac biet ngay tai day chinh
  // la cai lam khoa im lang tat khi ai do go `EDGE_PROXY_SECRET=`.
  return env.EDGE_PROXY_SECRET;
}
