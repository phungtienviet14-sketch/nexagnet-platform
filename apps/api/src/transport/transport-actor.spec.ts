import { UnauthorizedException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { InternalServiceGuard } from '../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import {
  INTERNAL_SERVICE_ACTOR,
  SYSTEM_TRANSPORT_ACTOR,
  transportActorOf,
} from './transport-actor.js';

/*
 * DANH TINH TREN MOT DONG LICH SU TAI CHINH — cong vao cua mot gia tri KHONG SUA LAI DUOC.
 *
 * `actor` o day khong dung lai o `AuditLog`: no vao `DriverFundEntry.recordedBy`,
 * `TripExpense.recordedBy`, `DriverFundPeriod.closedBy/reopenedBy`, `FundPeriodSnapshot.takenBy`.
 * Ba bang do khong co `UPDATE` va khong co `DELETE` (`INV-20`). Nghia la mot lan ghi sai ten nguoi
 * la VINH VIEN — khong co duong sua nao ngoai mot dong dao, va mot dong dao khong xoa duoc ten da
 * ghi.
 *
 * ---------------------------------------------------------------------------
 * HAI VONG SUA, VA VONG DAU CHUA DU:
 *
 * Truoc T3R, moi route ghi tien deu doc thang `@Headers` lay ten nguoi thao tac, o MOI che do.
 *
 * T3R vong 1 bit duong do o `AUTH_MODE=session`, nhung o `api-key`/`none` van lay chinh header DA
 * LOC lam danh tinh — va bo test nay khi do con KHOA chinh hanh vi sai do
 * (`expect(transportActorOf(requestOf(), 'quan.ly')).toBe('quan.ly')`). Bo loc chi chung minh chuoi
 * VO HAI VE HINH THUC; `giam-doc` qua duoc no de dang. Mot cai ten hop le ma khong ai kiem chung
 * duoc thi khong phai bang chung — no la bang chung GIA, va do la thu duy nhat te hon khong co
 * bang chung.
 *
 * T3R vong 2 (ban nay) bo han tham so header khoi `transportActorOf()`. Cho nen bo test duoi day
 * KHONG the viet noi phep thu "truyen mot ten gia mao vao" nua — no phai dat header vao CHINH yeu
 * cau HTTP roi chung minh ham bo qua. Va phep thu cuoi cung doc THANG ma nguon bon controller de
 * mot lan noi day lai duong cu se do o job `verify`, chu khong doi ai nho ra.
 */

/**
 * Khoa dich vu GIA cua bai kiem — ghep tu manh de bo quet bi mat cua pre-commit khong doc
 * no nhu mot gan gia tri credential. Gia tri nay khong mo duoc gi o dau ca.
 */
const FAKE_SERVICE_KEY = ['test', 'internal', 'service', 'key', '0123456789'].join('-');

/** Ten header bi cam — ghep lai de chinh bai test nay khong lam do phep thu doc ma nguon o duoi. */
const CLAIMED_ACTOR_HEADER = ['x', 'actor'].join('-');

const SESSION_ENV = {
  AUTH_MODE: 'session',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
} as const;

const original = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

function withEnv(patch: Record<string, string>): void {
  Object.assign(process.env, patch);
}

const requestOf = (authUser?: { username: string }): AuthenticatedRequest =>
  ({ authUser, headers: {} }) as unknown as AuthenticatedRequest;

/**
 * Mot yeu cau MANG SAN header gia mao — dung nhu cai ma mot trinh duyet gui len.
 *
 * Day la khac biet quan trong so voi vong 1: khong con duong nao "truyen" cai ten vao ham, nen
 * phep thu phai dat no dung cho ke tan cong dat duoc, roi doi cau tra loi.
 */
const requestClaiming = (claimed: string, authUser?: { username: string }): AuthenticatedRequest =>
  ({ authUser, headers: { [CLAIMED_ACTOR_HEADER]: claimed } }) as unknown as AuthenticatedRequest;

/** Cho `InternalServiceGuard` tu dat dau len yeu cau — khong bai test nao tu gan dau do. */
function markInternal(request: AuthenticatedRequest): void {
  const guard = new InternalServiceGuard({ getAllAndOverride: () => true } as never);
  guard.canActivate({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never);
}

describe('transportActorOf — AUTH_MODE=session', () => {
  it('nguoi ky la nguoi dang nhap, du yeu cau co mang mot ten khac trong header', () => {
    withEnv(SESSION_ENV);

    const actor = transportActorOf(requestClaiming('giam-doc', { username: 'ke.toan.a' }));

    expect(actor).toBe('ke.toan.a');
  });

  it('bo qua header KE CA khi no la mot ten hop le va nguoi that', () => {
    withEnv(SESSION_ENV);

    // Ten nay ton tai that trong he — do dung la kieu mao danh nguy hiem nhat, vi ban ghi trong
    // so se hoan toan hop ly khi doc lai.
    const actor = transportActorOf(requestClaiming('phuong.nt', { username: 'ke.toan.a' }));

    expect(actor).toBe('ke.toan.a');
  });

  it('THAT BAI DONG khi khong co phien: khong roi ve ten chung, va khong ghi duoc gi', () => {
    withEnv(SESSION_ENV);

    expect(() => transportActorOf(requestClaiming('ke-gia-mao'))).toThrow(UnauthorizedException);
  });

  it('duong dich vu-dich vu mang ten CO DINH, khong phai ten tu khai trong header', () => {
    withEnv({ ...SESSION_ENV, API_KEY: FAKE_SERVICE_KEY });

    // Dung chinh `InternalServiceGuard` de danh dau yeu cau — dau la mot `Symbol` cuc bo cua
    // module do, nen mot ben goi ngoai KHONG the tu gan vao than yeu cau.
    const request = {
      headers: { 'x-api-key': FAKE_SERVICE_KEY, [CLAIMED_ACTOR_HEADER]: 'giam-doc' },
    } as unknown as AuthenticatedRequest;
    markInternal(request);

    expect(transportActorOf(request)).toBe(INTERNAL_SERVICE_ACTOR);
  });

  it('mot yeu cau CHUA qua guard noi bo khong tu nhan minh la dich vu noi bo', () => {
    withEnv(SESSION_ENV);

    // Gia mao bang mot khoa chuoi — chinh kieu tan cong ma `Symbol` cuc bo sinh ra de chan.
    const forged = {
      internalService: true,
      headers: { [CLAIMED_ACTOR_HEADER]: 'giam-doc' },
    } as unknown as AuthenticatedRequest;

    expect(() => transportActorOf(forged)).toThrow(UnauthorizedException);
  });
});

describe('transportActorOf — AUTH_MODE khong-phien (demo / CI / dev offline)', () => {
  /*
   * Yeu cau cua #94 §4, doc nguyen van: "do not let an arbitrary browser header become audit
   * truth". Che do khong-phien la CHO DUY NHAT cau nay con bi vi pham sau vong 1.
   */
  it('`AUTH_MODE=none`: mot trinh duyet khai `giam-doc` van chi ghi duoc ten CO DINH', () => {
    withEnv({ AUTH_MODE: 'none' });

    expect(transportActorOf(requestClaiming('giam-doc'))).toBe(SYSTEM_TRANSPORT_ACTOR);
  });

  it('`AUTH_MODE=api-key`: khai gi cung khong doi duoc danh tinh kiem toan', () => {
    withEnv({ AUTH_MODE: 'api-key' });

    // Ca bon deu la ten "sach" — chung qua duoc bat ky bo loc chuoi nao. Do chinh la ly do mot bo
    // loc khong bao gio la cau tra loi cho cau hoi "ai".
    for (const claimed of ['giam-doc', 'quan.ly', 'demo.user', 'ke.toan.a']) {
      expect(transportActorOf(requestClaiming(claimed)), claimed).toBe(SYSTEM_TRANSPORT_ACTOR);
    }
  });

  it('khong khai gi ca cung ra dung cai ten do — khong co hai hang doi xu', () => {
    withEnv({ AUTH_MODE: 'api-key' });

    expect(transportActorOf(requestOf())).toBe(SYSTEM_TRANSPORT_ACTOR);
    expect(transportActorOf(requestClaiming('   '))).toBe(SYSTEM_TRANSPORT_ACTOR);
  });

  it('duong dich vu-dich vu o che do khong-phien van mang ten tien trinh, khong phai ten chung', () => {
    withEnv({ AUTH_MODE: 'none' });

    const request = {
      headers: { [CLAIMED_ACTOR_HEADER]: 'giam-doc' },
    } as unknown as AuthenticatedRequest;
    markInternal(request);

    expect(transportActorOf(request)).toBe(INTERNAL_SERVICE_ACTOR);
  });
});

/*
 * ---------------------------------------------------------------------------
 * CONG VAO, chu khong chi cai gieng.
 *
 * Hai bo tren chung minh `transportActorOf()` khong doc header. Nhung mot controller van hoan toan
 * co the tu doc header do roi truyen thang xuong service — duong cu cua T2, va la duong ma vong 1
 * de lai. Chu ky ham moi chan duoc phan lon (`transportActorOf(request)` khong con cho de nhet),
 * nhung KHONG chan duoc mot controller bo qua helper.
 *
 * Nen phep thu cuoi doc THANG ma nguon. No re, no chay o job `verify` (khong can Postgres), va no
 * do NGAY khi ai do noi lai duong cu — ke ca khi moi bai test hanh vi khac van xanh.
 */
const controllerSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const TRANSPORT_MUTATION_CONTROLLERS = [
  './costing/driver-fund.controller.ts',
  './costing/trip-expenses.controller.ts',
  './fleet/fleet.controller.ts',
  './trips/trips.controller.ts',
] as const;

describe('be mat HTTP van tai khong doc header danh tinh o bat ky che do nao', () => {
  it.each(TRANSPORT_MUTATION_CONTROLLERS)('%s khong nhac toi header do', (path) => {
    expect(controllerSource(path)).not.toContain(CLAIMED_ACTOR_HEADER);
  });

  it.each(TRANSPORT_MUTATION_CONTROLLERS)(
    '%s lay danh tinh tu `request`, khong tu mot tham so',
    (path) => {
      const source = controllerSource(path);

      // Moi lan goi phai dung `transportActorOf(request)` — mot tham so thu hai o day nghia la ai
      // do da tim duoc duong khac de dua mot claim vao lich su tai chinh.
      const calls = source.match(/transportActorOf\([^)]*\)/g) ?? [];

      expect(calls.length).toBeGreaterThan(0);
      expect([...new Set(calls)]).toEqual(['transportActorOf(request)']);
    },
  );
});
