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

describe('readEdgeProxySecret', () => {
  it('reads the secret from the environment at call time', () => {
    expect(readEdgeProxySecret({ EDGE_PROXY_SECRET: SECRET })).toBe(SECRET);
  });

  it('treats an unset or blank value as "guard off", not as a secret', () => {
    // Mot chuoi trang la cach mot bien bi dat nham thanh rong. Coi no la bi mat that thi khoa se
    // so sanh voi '' va tu choi tat ca — web chet ma khong ai hieu vi sao.
    for (const env of [{}, { EDGE_PROXY_SECRET: '' }, { EDGE_PROXY_SECRET: '   ' }]) {
      expect(readEdgeProxySecret(env)).toBeUndefined();
    }
  });
});
