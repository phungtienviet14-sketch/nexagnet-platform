import { createHash, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppEnv } from '@netviet/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * KHOA ORIGIN. Chan moi request khong den tu edge, TRUOC khi cham route nghiep vu hay phien.
 *
 * VI SAO KHONG PHAI MOT `CanActivate`: guard cua Nest chay SAU khi router da chon xong handler va
 * sau ca middleware phien. Yeu cau o day la "truoc business/auth routes" theo nghia den — mot
 * request khong hop le khong duoc tao phien, khong duoc cham vao store Postgres, khong duoc danh
 * thuc mot handler nao. Chi middleware Express dat SOM NHAT moi lam duoc dieu do.
 *
 * GIOI HAN da biet: AdminJS tu gan router cua no luc module khoi tao, tuc co the nam TRUOC
 * middleware nay trong stack Express. Ban trien khai Cloudflare chay `ADMIN_UI=off` nen khong co
 * router do; va Worker van them header cho `/admin*`, nen duong do cung khong ho. Neu sau nay bat
 * AdminJS sau mot edge cong khai thi phai kiem lai thu tu stack truoc.
 */
export const EDGE_PROXY_HEADER = 'x-nexagnet-edge-key';

/**
 * Duong suc khoe DUY NHAT duoc mien. `/health/media` co tinh KHONG nam o day: no doc cau hinh
 * media cua khach, con `/health` chi tra trang thai song/chet cua tien trinh.
 */
export const EDGE_PROXY_HEALTH_PATH = '/health';

export type EdgeProxyReason =
  | 'EDGE_GUARD_DISABLED'
  | 'EDGE_KEY_MATCH'
  | 'INTERNAL_HEALTH_PROBE'
  | 'EDGE_KEY_MISSING'
  | 'EDGE_KEY_MISMATCH';

export interface EdgeProxyRequestFacts {
  readonly method: string;
  readonly path: string;
  readonly providedKey: string | undefined;
  /** `x-forwarded-for` — CO mat nghia la request di qua mot proxy, tuc den tu ngoai cum. */
  readonly forwardedFor: string | undefined;
}

export interface EdgeProxyDecision {
  readonly allowed: boolean;
  readonly reason: EdgeProxyReason;
}

/**
 * FAIL-CLOSED khi bi mat da duoc dat: mac dinh la TU CHOI, chi hai duong duoc di qua.
 *
 * Thu tu quan trong. Kiem khoa edge TRUOC, roi moi den ngoai le suc khoe — nho vay ngoai le chi
 * la duong du phong cho prober noi bo, khong phai duong tat ma mot request co header sai co the
 * roi vao.
 */
export function evaluateEdgeProxyRequest(
  secret: string | undefined,
  facts: EdgeProxyRequestFacts,
): EdgeProxyDecision {
  if (!secret) return { allowed: true, reason: 'EDGE_GUARD_DISABLED' };
  if (typeof facts.providedKey === 'string' && matchesSecret(facts.providedKey, secret)) {
    return { allowed: true, reason: 'EDGE_KEY_MATCH' };
  }
  if (isInternalHealthProbe(facts)) return { allowed: true, reason: 'INTERNAL_HEALTH_PROBE' };
  return {
    allowed: false,
    reason: facts.providedKey === undefined ? 'EDGE_KEY_MISSING' : 'EDGE_KEY_MISMATCH',
  };
}

/**
 * Prober cua Northflank goi thang container bang IP pod, nen request cua no KHONG co
 * `x-forwarded-for`. Moi request den tu Internet deu di qua ingress, va ingress LUON them header
 * do — mot client ben ngoai khong co cach nao bo no ra.
 *
 * Do la ly do ngoai le nay khong phai mot "public bypass": no khong mo them duong nao ra Internet,
 * no chi giu nguyen duong von da chi ton tai ben trong cum. Kiem bang bo test trong tep spec:
 * cung `/health` do, co `x-forwarded-for` thi bi tu choi.
 */
function isInternalHealthProbe(facts: EdgeProxyRequestFacts): boolean {
  // Prober KHONG gui khoa nao ca. Doi `undefined` — chu khong phai "khoa sai cung duoc" — de mot
  // request mang khoa hong khong bao gio roi vao duong nay; no phai bi tu choi nhu moi khoa hong
  // khac, o dung ly do `EDGE_KEY_MISMATCH`.
  if (facts.providedKey !== undefined) return false;
  if (facts.forwardedFor !== undefined) return false;
  const method = facts.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  return facts.path === EDGE_PROXY_HEALTH_PATH;
}

/**
 * So sanh khong ro ri thoi gian. Bam SHA-256 truoc de hai buffer LUON cung do dai —
 * `timingSafeEqual` nem loi khi do dai khac nhau, va chenh lech do dai tu no da la ro ri.
 * Cung cach lam voi `ApiKeyGuard`, co y giong nhau de doc mot cho hieu ca hai.
 */
function matchesSecret(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function readEdgeProxyFacts(request: Request): EdgeProxyRequestFacts {
  return {
    method: request.method,
    path: request.path,
    providedKey: firstHeaderValue(request.headers[EDGE_PROXY_HEADER]),
    forwardedFor: firstHeaderValue(request.headers['x-forwarded-for']),
  };
}

/**
 * TAT khi khong co bi mat — va do la hop dong, khong phai su tien tay.
 *
 * Cac stack chay sau Caddy khong co dia chi cong cho api/web, nen chung khong can khoa nay; bat
 * buoc bien o production se lam hong dung nhung ban trien khai da an toan san. Mot ban trien khai
 * CO origin cong khai ma quen dat bien thi loi phai lo ra o buoc nghiem thu ("goi thang code.run
 * khong header phai la 403"), chu khong phai o day.
 */
export function configureEdgeProxyGuard(app: NestExpressApplication, env: AppEnv): void {
  const secret = env.EDGE_PROXY_SECRET;
  const logger = new Logger('EdgeProxyGuard');
  if (!secret) {
    logger.log(
      'EDGE_PROXY_SECRET chua dat -> khoa edge TAT. Dung cho ban trien khai co edge rieng giu cong (vd Caddy tren VM).',
    );
    return;
  }
  logger.log(`Khoa edge BAT — moi request phai mang header ${EDGE_PROXY_HEADER}.`);
  app.use((request: Request, response: Response, next: NextFunction): void => {
    const decision = evaluateEdgeProxyRequest(secret, readEdgeProxyFacts(request));
    if (decision.allowed) {
      next();
      return;
    }
    // KHONG tra `reason` ve client: phan biet "thieu" voi "sai" la mot manh thong tin cho nguoi
    // do khoa. Ly do van duoc ghi log phia server de nguoi truc doc duoc.
    logger.warn(
      `edge.denied reason=${decision.reason} method=${request.method} path=${request.path}`,
    );
    response.status(403).json({ statusCode: 403, message: 'Forbidden' });
  });
}
