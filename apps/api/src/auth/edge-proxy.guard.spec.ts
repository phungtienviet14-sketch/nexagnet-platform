import { describe, expect, it } from 'vitest';
import {
  EDGE_PROXY_HEADER,
  EDGE_PROXY_HEALTH_PATH,
  evaluateEdgeProxyRequest,
  readEdgeProxyFacts,
  type EdgeProxyRequestFacts,
} from './edge-proxy.guard.js';

const SECRET = 'a'.repeat(64);

function facts(overrides: Partial<EdgeProxyRequestFacts> = {}): EdgeProxyRequestFacts {
  return {
    method: 'GET',
    path: '/orders',
    providedKey: undefined,
    forwardedFor: '203.0.113.7',
    ...overrides,
  };
}

describe('evaluateEdgeProxyRequest', () => {
  it('allows every request when no secret is configured', () => {
    // Stack chay sau Caddy khong dat bien nay. Neu mac dinh la tu choi thi nang ban nay len
    // ultty-gd1-test se lam chet mot he thong von dang an toan bang mot co che khac.
    expect(evaluateEdgeProxyRequest(undefined, facts())).toEqual({
      allowed: true,
      reason: 'EDGE_GUARD_DISABLED',
    });
  });

  it('allows a request carrying the exact edge key', () => {
    expect(evaluateEdgeProxyRequest(SECRET, facts({ providedKey: SECRET }))).toEqual({
      allowed: true,
      reason: 'EDGE_KEY_MATCH',
    });
  });

  it('denies a request with no edge key', () => {
    expect(evaluateEdgeProxyRequest(SECRET, facts())).toEqual({
      allowed: false,
      reason: 'EDGE_KEY_MISSING',
    });
  });

  it('denies a request whose edge key is wrong', () => {
    expect(evaluateEdgeProxyRequest(SECRET, facts({ providedKey: 'b'.repeat(64) }))).toEqual({
      allowed: false,
      reason: 'EDGE_KEY_MISMATCH',
    });
  });

  it('denies a key of the right shape but wrong value, and a prefix of the real key', () => {
    // Bam SHA-256 truoc khi so sanh nen do dai khac nhau khong lam `timingSafeEqual` nem loi.
    for (const wrong of [SECRET.slice(0, 32), `${SECRET}x`, SECRET.toUpperCase()]) {
      expect(evaluateEdgeProxyRequest(SECRET, facts({ providedKey: wrong })).allowed).toBe(false);
    }
  });

  it('denies unsafe methods even on the health path', () => {
    expect(
      evaluateEdgeProxyRequest(
        SECRET,
        facts({ method: 'POST', path: EDGE_PROXY_HEALTH_PATH, forwardedFor: undefined }),
      ),
    ).toEqual({ allowed: false, reason: 'EDGE_KEY_MISSING' });
  });
});

describe('internal health probe exemption', () => {
  it('allows the in-cluster probe, which arrives without a forwarding header', () => {
    for (const method of ['GET', 'HEAD']) {
      expect(
        evaluateEdgeProxyRequest(
          SECRET,
          facts({ method, path: EDGE_PROXY_HEALTH_PATH, forwardedFor: undefined }),
        ),
      ).toEqual({ allowed: true, reason: 'INTERNAL_HEALTH_PROBE' });
    }
  });

  it('DENIES the same health request once it arrives through a proxy', () => {
    // Day la khang dinh giu cho ngoai le khong bien thanh public bypass. Moi request tu Internet
    // deu di qua ingress, va ingress luon them `x-forwarded-for`; khach ben ngoai khong bo duoc.
    expect(
      evaluateEdgeProxyRequest(
        SECRET,
        facts({ path: EDGE_PROXY_HEALTH_PATH, forwardedFor: '203.0.113.7' }),
      ),
    ).toEqual({ allowed: false, reason: 'EDGE_KEY_MISSING' });
  });

  it('does not extend the exemption to any neighbouring path', () => {
    // `/health/media` doc cau hinh media cua khach; `/healthz` va `/health-check` la nhung ten
    // nguoi ta hay them sau nay. Khong duong nao trong so do duoc di nho vao ngoai le.
    for (const path of ['/health/media', '/healthz', '/health-check', '/health/', '/HEALTH']) {
      expect(
        evaluateEdgeProxyRequest(SECRET, facts({ path, forwardedFor: undefined })).allowed,
      ).toBe(false);
    }
  });

  it('does not let a wrong key fall through into the exemption', () => {
    expect(
      evaluateEdgeProxyRequest(
        SECRET,
        facts({
          path: EDGE_PROXY_HEALTH_PATH,
          forwardedFor: undefined,
          providedKey: 'b'.repeat(64),
        }),
      ),
    ).toEqual({ allowed: false, reason: 'EDGE_KEY_MISMATCH' });
  });
});

describe('readEdgeProxyFacts', () => {
  it('reads the header names the edge actually sends', () => {
    const request = {
      method: 'POST',
      path: '/auth/login',
      headers: { [EDGE_PROXY_HEADER]: SECRET, 'x-forwarded-for': '203.0.113.7' },
    } as unknown as Parameters<typeof readEdgeProxyFacts>[0];
    expect(readEdgeProxyFacts(request)).toEqual({
      method: 'POST',
      path: '/auth/login',
      providedKey: SECRET,
      forwardedFor: '203.0.113.7',
    });
  });

  it('takes the first value when a header is repeated', () => {
    // Node gom header lap thanh mang. Bo qua truong hop nay thi `providedKey` thanh mot mang va
    // phep so sanh chuoi im lang tra ve sai cho mot request that ra hop le.
    const request = {
      method: 'GET',
      path: '/health',
      headers: { [EDGE_PROXY_HEADER]: [SECRET, 'khac'], 'x-forwarded-for': ['198.51.100.4'] },
    } as unknown as Parameters<typeof readEdgeProxyFacts>[0];
    expect(readEdgeProxyFacts(request)).toMatchObject({
      providedKey: SECRET,
      forwardedFor: '198.51.100.4',
    });
  });
});
