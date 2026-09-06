import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { CAPABILITY_IDS } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from './app-composition.js';

/**
 * Hai khoa metadata cua Nest, ghi thang o day thay vi import tu `@nestjs/common/constants`:
 * duong dan con do khong phat khai bao kieu, nen `tsc --noEmit` gay o TS2307 trong khi vitest van
 * chay duoc — mot bai test XANH cuc bo va DO tren CI.
 *
 * Ghi tay hai chuoi nay an toan CHINH VI bai neo o cuoi tep: doi khoa sai thi `allRoutes()` tra ve
 * rong, va bai neo do ngay. Khong co no thi day se la mot hang so am tham lam ca bo kiem tra thanh
 * mot phep do tren bang rong.
 */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

/**
 * BANG DINH TUYEN DA HOP NHAT PHAI KHONG CO HAI ROUTE TRUNG NHAU.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI — mot su co CO THAT, do tren ban da trien khai (T9/#91).
 *
 * `DriverFuelController` giu `POST transport/me/fuel/slips/:id/evidence` (gan mot CHUOI DINH VI,
 * tu thoi `PG-05` chua co kho anh). `DriverFuelEvidenceController` — them o #169 de TAI ANH THAT —
 * khai dung METHOD do tren dung PATH do.
 *
 * Nest gan cai duoc dang ky TRUOC. Ket qua tren stack that:
 *
 *   POST .../evidence  + than JSON `{locator}`  -> 201
 *   POST .../evidence  + `multipart/form-data`  -> 400 "body: expected object, received undefined"
 *
 * Tuc nut "tai anh bien lai" cua lai xe KHONG CHAY. Va no hong theo kieu te nhat:
 *
 *   · khong loi build — hai controller hop le, moi cai mot tep;
 *   · khong test do — moi controller deu co bo test rieng va deu XANH, vi chung duoc dung LEN
 *     RIENG LE chu khong qua bang dinh tuyen hop nhat;
 *   · khong canh bao luc chay — Nest im lang khi mot route bi che khuat.
 *
 * Ba dieu do cong lai nghia la KHONG mot phep kiem nao trong kho nay bat duoc no, ngoai viec goi
 * that vao ban dang chay. Bai test nay bien phep goi that do thanh mot phep kiem TINH.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI CHUAN HOA TEN THAM SO.
 *
 * `/a/:id/b` va `/a/:tripId/b` la HAI chuoi khac nhau nhung MOT route voi Express. So sanh chuoi
 * tho se bo lot dung nhung va cham kho thay nhat — nhung cai ma hai nguoi dat ten tham so khac
 * nhau. Nen moi `:xxx` duoc quy ve `:param` truoc khi doi chieu.
 */

/** `:tripId` / `:id` / `:evidenceId` deu la MOT cho trong voi bo dinh tuyen. */
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
  readonly handler: string;
}

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const prefix = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
  const prototype = controller.prototype as Record<string, unknown>;

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
          handler: name,
        },
      ];
    });
}

/** Moi capability duoc bat cung luc: do la be mat rong nhat mot ban trien khai co the mang. */
function allRoutes(): Route[] {
  const composition = buildAppComposition([...CAPABILITY_IDS]);
  return composition.controllers.flatMap((controller) =>
    routesOf(controller as new (...args: never[]) => unknown),
  );
}

describe('bang dinh tuyen hop nhat', () => {
  it('khong mot cap (method, path) nao bi hai handler cung nhan', () => {
    const seen = new Map<string, Route[]>();
    for (const route of allRoutes()) {
      const key = `${route.method} ${route.path}`;
      seen.set(key, [...(seen.get(key) ?? []), route]);
    }

    const clashes = [...seen.entries()]
      .filter(([, routes]) => routes.length > 1)
      .map(([key, routes]) => ({
        route: key,
        claimedBy: routes.map((route) => `${route.controller}.${route.handler}`),
      }));

    // Thong bao phai noi CAI GI dam CAI GI: mot con so khong giup ai di sua.
    expect(clashes, JSON.stringify(clashes, null, 2)).toEqual([]);
  });

  /**
   * Neo NGUOC LAI: bai tren chi co gia tri neu phep quet that su thay duoc route.
   *
   * Mot loi danh may trong khoa metadata se lam `allRoutes()` tra ve rong, va "khong co va cham"
   * khi do la mot cau noi that ve mot bang RONG — dung hinh dang "xanh vi khong do gi ca".
   */
  it('phep quet that su doc duoc bang dinh tuyen', () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(50);

    const upload = routes.find(
      (route) => route.controller === 'DriverFuelEvidenceController' && route.method === 'POST',
    );
    expect(upload?.path).toBe('/transport/me/fuel/slips/:param/evidence/upload');
  });
});
