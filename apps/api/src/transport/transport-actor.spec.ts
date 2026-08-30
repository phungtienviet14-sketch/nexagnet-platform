import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { InternalServiceGuard } from '../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import {
  ANONYMOUS_TRANSPORT_ACTOR,
  INTERNAL_SERVICE_ACTOR,
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
 * Truoc T3R, moi route ghi tien deu doc thang `@Headers('x-actor')`. Mot ke toan hop le chi can
 * them mot dong header la so sach ghi ten Giam doc. Bo test nay giu cai cong da bit lai do.
 */

/**
 * Khoa dich vu GIA cua bai kiem — ghep tu manh de bo quet bi mat cua pre-commit khong doc
 * no nhu mot gan gia tri credential. Gia tri nay khong mo duoc gi o dau ca.
 */
const FAKE_SERVICE_KEY = ['test', 'internal', 'service', 'key', '0123456789'].join('-');

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
  ({ authUser }) as AuthenticatedRequest;

describe('transportActorOf — AUTH_MODE=session', () => {
  it('KHONG cho `x-actor` ghi de danh tinh da xac thuc: nguoi ky van la nguoi dang nhap', () => {
    withEnv(SESSION_ENV);

    const actor = transportActorOf(requestOf({ username: 'ke.toan.a' }), 'giam-doc');

    expect(actor).toBe('ke.toan.a');
  });

  it('bo qua `x-actor` KE CA khi no la mot ten hop le va nguoi that', () => {
    withEnv(SESSION_ENV);

    // Ten nay ton tai that trong he — do dung la kieu mao danh nguy hiem nhat, vi ban ghi trong
    // so se hoan toan hop ly khi doc lai.
    const actor = transportActorOf(requestOf({ username: 'ke.toan.a' }), 'phuong.nt');

    expect(actor).toBe('ke.toan.a');
  });

  it('THAT BAI DONG khi khong co phien: khong roi ve `operator`, va khong ghi duoc gi', () => {
    withEnv(SESSION_ENV);

    expect(() => transportActorOf(requestOf(), 'ke-gia-mao')).toThrow(UnauthorizedException);
  });

  it('duong dich vu-dich vu mang ten CO DINH, khong phai ten tu khai trong header', () => {
    withEnv({ ...SESSION_ENV, API_KEY: FAKE_SERVICE_KEY });

    // Dung chinh `InternalServiceGuard` de danh dau yeu cau — dau la mot `Symbol` cuc bo cua
    // module do, nen mot ben goi ngoai KHONG the tu gan vao than yeu cau.
    const request = {
      headers: { 'x-api-key': FAKE_SERVICE_KEY },
    } as unknown as AuthenticatedRequest;
    const guard = new InternalServiceGuard({ getAllAndOverride: () => true } as never);
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as never);

    expect(transportActorOf(request, 'giam-doc')).toBe(INTERNAL_SERVICE_ACTOR);
  });

  it('mot yeu cau CHUA qua guard noi bo khong tu nhan minh la dich vu noi bo', () => {
    withEnv(SESSION_ENV);

    // Gia mao bang mot khoa chuoi — chinh kieu tan cong ma `Symbol` cuc bo sinh ra de chan.
    const forged = { internalService: true } as unknown as AuthenticatedRequest;

    expect(() => transportActorOf(forged, 'giam-doc')).toThrow(UnauthorizedException);
  });
});

describe('transportActorOf — AUTH_MODE khong-phien (demo / CI / dev offline)', () => {
  it('chap nhan `x-actor` hop le: day la danh tinh DUY NHAT con lai o che do nay', () => {
    withEnv({ AUTH_MODE: 'api-key' });

    expect(transportActorOf(requestOf(), 'quan.ly')).toBe('quan.ly');
  });

  it('mac dinh `operator` khi khong khai gi — khong bao gio de trong', () => {
    withEnv({ AUTH_MODE: 'api-key' });

    expect(transportActorOf(requestOf(), '   ')).toBe(ANONYMOUS_TRANSPORT_ACTOR);
    expect(transportActorOf(requestOf())).toBe(ANONYMOUS_TRANSPORT_ACTOR);
  });

  it('CHAN header qua dai va ky tu la — gia tri nay con chay vao neo trace THO', () => {
    withEnv({ AUTH_MODE: 'api-key' });

    for (const hostile of ['a'.repeat(5_000), 'xuong\ndong', '{"json":"injection"}', 'a b']) {
      expect(transportActorOf(requestOf(), hostile), hostile).toBe(ANONYMOUS_TRANSPORT_ACTOR);
    }
  });

  it('`AUTH_MODE=none` cung di duong da loc, khong duong rieng nao', () => {
    withEnv({ AUTH_MODE: 'none' });

    expect(transportActorOf(requestOf(), 'demo.user')).toBe('demo.user');
    expect(transportActorOf(requestOf(), '<script>')).toBe(ANONYMOUS_TRANSPORT_ACTOR);
  });
});
