import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

/**
 * WT-040 — phien cho co DUONG HTTP THAT, khong chi mot hang so trong bang hanh dong.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI
 * ============================================================================================
 *
 * Khai mot ma trong `TRANSPORT_ACTIONS` va cho no qua `transport-actions.spec.ts` KHONG chung minh
 * rang co mot duong de goi. Hai thu do doc lap: mot bang phan quyen day du van co the phuc vu mot
 * be mat khong ton tai, va moi bai kiem hanh vi o tang dich vu van xanh.
 *
 * Nen bai nay doc BANG DINH TUYEN da hop nhat va khang dinh ba route co that, cung ba dong ho —
 * chu khong khang dinh mot ten lop.
 */

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

const normalisePath = (raw: string): string =>
  `/${raw}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':param' : segment))
    .join('/') || '/';

interface Route {
  readonly method: string;
  readonly path: string;
  readonly controller: string;
}

const routesFor = (capabilities: Parameters<typeof buildAppComposition>[0]): Route[] =>
  buildAppComposition(capabilities).controllers.flatMap((controller) => {
    const prefix = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
    const prototype = (controller as { prototype: Record<string, unknown> }).prototype;
    return Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const handler = prototype[name];
        if (typeof handler !== 'function') return [];
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (path === undefined || method === undefined) return [];
        return [
          {
            method: RequestMethod[method] ?? String(method),
            path: normalisePath(`${prefix}/${path}`),
            controller: controller.name,
          },
        ];
      });
  });

const CAPABILITIES = ['transport-core', 'transport-proof', 'transport-checkpoint'] as const;

describe('duong HTTP cua phien cho — WT-040', () => {
  const routes = routesFor([...CAPABILITIES]);
  const has = (method: string, path: string): boolean =>
    routes.some((route) => route.method === method && route.path === path);

  it('lai xe co DUNG hai duong: mo mot phien, va doc phien cua chinh minh', () => {
    expect(has('POST', '/transport/me/waiting-sessions')).toBe(true);
    expect(has('GET', '/transport/me/waiting-sessions')).toBe(true);
  });

  /**
   * BAI QUAN TRONG NHAT cua tep nay.
   *
   * Lai xe dong mot phien bang cach bam `Khach da nhan hang` — tuc ghi mot moc `DELIVERY_ACCEPTED`
   * — va chinh moc do dong phien qua `DeliveryWaitingCloser`. Mot tuyen dong RIENG cho lai xe se
   * la duong ghi THU HAI cho cung mot su that: mot phien da dong ma khong co moc nhan hang nao doi
   * ung, va thoi luong cho lech voi dong thoi gian.
   */
  it('lai xe KHONG co duong dong phien nao', () => {
    const driverRoutes = routes.filter((route) => route.path.startsWith('/transport/me/waiting'));
    expect(driverRoutes.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      'GET /transport/me/waiting-sessions',
      'POST /transport/me/waiting-sessions',
    ]);
  });

  it('van hanh doc duoc phien cho cua mot vong chay va dong duoc mot phien bo quen', () => {
    expect(has('GET', '/transport/runs/:param/waiting-sessions')).toBe(true);
    expect(has('POST', '/transport/waiting-sessions/:param/close')).toBe(true);
  });

  /**
   * PHU CAP CHO (`#279` O6) — ba duong, va KHONG mot duong nao mang tien tien to `/transport/me/`.
   *
   * Do la ca khang dinh: ca hai ma quyen nam ngoai `SELF_SCOPE_ACTIONS`, nen vai `SALE` khong goi
   * duoc mot duong nao. Mot lai xe tu de nghi roi tu duyet phu cap cho chinh minh la dung cai ma
   * kiem soat noi bo sinh ra de chan.
   */
  it('phu cap cho co ba duong van phong, va khong mot duong lai xe nao', () => {
    expect(has('POST', '/transport/waiting-allowances')).toBe(true);
    expect(has('POST', '/transport/waiting-allowances/:param/decision')).toBe(true);
    expect(has('GET', '/transport/waiting-allowances/pending')).toBe(true);

    const driverAllowanceRoutes = routes.filter((route) =>
      route.path.startsWith('/transport/me/waiting-allowance'),
    );
    expect(driverAllowanceRoutes).toEqual([]);
  });

  /**
   * KHONG co duong SUA va KHONG co duong XOA. Doi y ve sau la mot de nghi MOI tren cung phien cho —
   * `#279` O6 doi *"rejected/corrected history preserved"*, va mot tuyen `PATCH`/`DELETE` se lam
   * lich su do khong con.
   */
  it('khong mot duong sua hay xoa nao tren phu cap cho', () => {
    const allowanceRoutes = routes.filter((route) =>
      route.path.startsWith('/transport/waiting-allowances'),
    );
    expect(allowanceRoutes.map((route) => route.method).sort()).toEqual([
      'GET',
      'GET',
      'POST',
      'POST',
    ]);
  });

  it('khong duong nao ton tai o mot khach chi bat `transport-core`', () => {
    const core = routesFor(['transport-core']);
    expect(core.filter((route) => route.path.includes('waiting'))).toEqual([]);
    expect(core.filter((route) => route.path.includes('allowance'))).toEqual([]);
  });

  /** Neo NGUOC LAI: phep quet phai that su doc duoc bang dinh tuyen. */
  it('phep quet that su doc duoc bang dinh tuyen', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(has('POST', '/transport/me/checkpoints')).toBe(true);
  });
});
