import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

/**
 * DC-040 — chung tu van hanh co DUONG HTTP THAT, va no den/di cung `transport-checkpoint`.
 *
 * Khai mot ma trong `TRANSPORT_ACTIONS` KHONG chung minh rang co mot duong de goi: mot bang phan
 * quyen day du van co the phuc vu mot be mat khong ton tai, va moi bai kiem hanh vi o tang dich vu
 * van xanh. Nen bai nay doc BANG DINH TUYEN da hop nhat.
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

describe('duong HTTP cua chung tu van hanh — DC-040', () => {
  const routes = routesFor([...CAPABILITIES]);
  const has = (method: string, path: string): boolean =>
    routes.some((route) => route.method === method && route.path === path);

  it('lai xe ghi va doc duoc chung tu cua chinh minh', () => {
    expect(has('POST', '/transport/me/documents')).toBe(true);
    expect(has('GET', '/transport/me/documents')).toBe(true);
  });

  /**
   * `#279` O2: *"immutable boundary prevents driver deletion once evidence is authoritative"*.
   *
   * Cach re nhat de giu dieu do la khong co duong — va bai nay do CHINH dieu do, khong do mot phep
   * kiem quyen co the bi sua.
   */
  it('lai xe KHONG co mot duong bia mo nao', () => {
    const driverRoutes = routes
      .filter((route) => route.path.startsWith('/transport/me/'))
      .map((route) => route.path);
    expect(driverRoutes.some((path) => path.includes('withdraw'))).toBe(false);
  });

  it('lai xe ghi duoc buoc `dang giu to bien nhan`', () => {
    expect(has('POST', '/transport/me/receipt-handovers')).toBe(true);
  });

  it('van hanh doc, ghi bu va bia mo duoc; doc duoc chuoi ban giao cua mot don', () => {
    expect(has('GET', '/transport/runs/:param/documents')).toBe(true);
    expect(has('GET', '/transport/orders/:param/documents')).toBe(true);
    expect(has('GET', '/transport/orders/:param/receipt-handover')).toBe(true);
    expect(has('POST', '/transport/runs/:param/documents')).toBe(true);
    expect(has('POST', '/transport/documents/:param/withdraw')).toBe(true);
    expect(has('POST', '/transport/receipt-handovers')).toBe(true);
  });

  it('khong duong nao ton tai o mot khach chi bat `transport-core`', () => {
    const core = routesFor(['transport-core']);
    expect(core.filter((route) => route.path.includes('document'))).toEqual([]);
    expect(core.filter((route) => route.path.includes('receipt-handover'))).toEqual([]);
  });

  /** Neo NGUOC LAI: phep quet phai that su doc duoc bang dinh tuyen. */
  it('phep quet that su doc duoc bang dinh tuyen', () => {
    expect(routes.length).toBeGreaterThan(25);
    expect(has('POST', '/transport/me/checkpoints')).toBe(true);
  });
});
