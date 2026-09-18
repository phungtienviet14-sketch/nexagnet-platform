import { describe, expect, it } from 'vitest';
import { evaluateWebEdgeProxyRequest, readEdgeProxySecret } from './edge-proxy';

const SECRET = 'a'.repeat(64);

describe('evaluateWebEdgeProxyRequest', () => {
  it('allows everything when no secret is configured', () => {
    // Ban chay sau Caddy khong dat bien nay va phai tiep tuc phuc vu binh thuong.
    expect(evaluateWebEdgeProxyRequest(undefined, null)).toEqual({
      allowed: true,
      reason: 'EDGE_GUARD_DISABLED',
    });
  });

  it('allows a request carrying the exact edge key', () => {
    expect(evaluateWebEdgeProxyRequest(SECRET, SECRET)).toEqual({
      allowed: true,
      reason: 'EDGE_KEY_MATCH',
    });
  });

  it('rejects a request with no header at all', () => {
    for (const missing of [null, undefined, '']) {
      expect(evaluateWebEdgeProxyRequest(SECRET, missing)).toEqual({
        allowed: false,
        reason: 'EDGE_KEY_REJECTED',
      });
    }
  });

  it('rejects a wrong key, a prefix of the key, and a case-shifted key', () => {
    for (const wrong of ['b'.repeat(64), SECRET.slice(0, 32), `${SECRET}x`, SECRET.toUpperCase()]) {
      expect(evaluateWebEdgeProxyRequest(SECRET, wrong)).toEqual({
        allowed: false,
        reason: 'EDGE_KEY_REJECTED',
      });
    }
  });

  it('has no health-path exemption, unlike the API guard', () => {
    // Web dung health check TCP nen khong co prober HTTP noi bo. Khang dinh nay giu cho khong ai
    // "cho dong bo" hai ben bang cach chep ngoai le cua API sang day.
    expect(evaluateWebEdgeProxyRequest(SECRET, null).allowed).toBe(false);
  });
});

describe('a secret that is set but unusable fails CLOSED', () => {
  // Mot origin cong khai IM LANG mo toang te hon mot service chet ON AO. Neu nguoi van hanh go
  // `EDGE_PROXY_SECRET=` tren service web (con API thi dat dung), web phai TU CHOI, khong duoc
  // am tham tro lai che do khong khoa.
  it('rejects every request when the value is blank or whitespace', () => {
    for (const raw of ['', '   ', '\t\n']) {
      expect(evaluateWebEdgeProxyRequest(raw, SECRET)).toEqual({
        allowed: false,
        reason: 'EDGE_SECRET_MISCONFIGURED',
      });
    }
  });

  it('rejects every request when the value is shorter than the API minimum', () => {
    // Ben API zod `.min(32)` lam tien trinh chet luc khoi dong. Web khong co tang do nen phai tu
    // kiem cung mot con so, neu khong hai service se khac nhau ve "the nao la khoa hop le".
    expect(evaluateWebEdgeProxyRequest('e'.repeat(31), 'e'.repeat(31)).reason).toBe(
      'EDGE_SECRET_MISCONFIGURED',
    );
    expect(evaluateWebEdgeProxyRequest('e'.repeat(32), 'e'.repeat(32)).reason).toBe(
      'EDGE_KEY_MATCH',
    );
  });

  it('still treats a genuinely unset variable as "no lock here"', () => {
    // Day la hop dong voi stack sau Caddy: khong co origin cong khai nen khong can khoa.
    expect(evaluateWebEdgeProxyRequest(undefined, null)).toEqual({
      allowed: true,
      reason: 'EDGE_GUARD_DISABLED',
    });
  });
});

describe('readEdgeProxySecret', () => {
  it('reads the secret from the environment at call time', () => {
    expect(readEdgeProxySecret({ EDGE_PROXY_SECRET: SECRET })).toBe(SECRET);
  });

  it('returns a blank value verbatim instead of erasing it to undefined', () => {
    // Neu ham nay nuot mat su khac biet giua "chua dat" va "dat rong" thi tang tren khong con
    // co hoi fail-closed — dung cai hong ma bo test ngay ben tren dang giu.
    expect(readEdgeProxySecret({ EDGE_PROXY_SECRET: '' })).toBe('');
    expect(readEdgeProxySecret({ EDGE_PROXY_SECRET: '   ' })).toBe('   ');
    expect(readEdgeProxySecret({})).toBeUndefined();
  });
});
