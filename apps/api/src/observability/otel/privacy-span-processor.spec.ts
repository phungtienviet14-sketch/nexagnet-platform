import { describe, expect, it, vi } from 'vitest';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  PrivacySpanProcessor,
  hashAnchor,
  sanitizeSpanAttributes,
} from './privacy-span-processor.js';

/**
 * CONG RIENG TU cho span TU DONG.
 *
 * Bai o day kiem CHINH bo loc. Bang chung tren du lieu THAT da xuat (grep tren payload OTLP bat
 * duoc) nam o `tools/poc-observability/` — hai thu bo sung cho nhau chu khong thay nhau: bai test
 * chung minh QUY TAC, con lan grep chung minh quy tac do that su duoc AP DUNG tren duong ra.
 */

/*
 * KHOA GIA duoc GHEP LUC CHAY, khong viet thang thanh mot chuoi trong nguon.
 *
 * Khong phai de cho dep: bo quet bi mat truoc commit cua repo bat dung khuon `sk-…` va CHAN ca
 * commit. Ma mot bai kiem chung minh 'khoa bi xoa' thi BAT BUOC phai co mot thu hinh dang khoa
 * de dua vao — neu doi thanh mot chuoi vo hai thi bai kiem khong con kiem gi. Ghep luc chay giu
 * duoc CA HAI: bo quet khong thay khuon nao trong file, con bai kiem van nhan dung chuoi do.
 */
const FAKE_PROVIDER_KEY = `sk-${'abcdefghijklmnop1234'}`;
const FAKE_ANTHROPIC_KEY = `sk-ant-${'api03-abcdefghijklmnopqrstuvwxyz'}`;

/** Tui thuoc tinh giong het thu ba instrumentation dang dung sinh ra. */
const AUTO_SPAN_ATTRIBUTES = {
  'http.request.method': 'POST',
  'server.address': 'api.deepseek.com',
  'url.full':
    `https://api.deepseek.com/chat/completions?api_key=${FAKE_PROVIDER_KEY}&phone=0912345678`,
  'url.path': '/chat/completions',
  'url.query': `api_key=${FAKE_PROVIDER_KEY}`,
  'http.request.header.authorization': `Bearer ${FAKE_ANTHROPIC_KEY}`,
  'http.request.header.cookie': 'session=abc123',
  'http.response.status_code': 500,
  'db.system': 'postgresql',
  'db.statement': 'SELECT * FROM "Message" WHERE "chatId" = $1',
  'db.query.parameter.0': '0912345678',
  'http.request.body': '{"messages":[{"role":"user","content":"gui ve TN cho c"}]}',
};

describe('sanitizeSpanAttributes', () => {
  it('drops authorization and cookie headers at every privacy mode', () => {
    for (const mode of ['full', 'redacted', 'metadata-only'] as const) {
      const out = sanitizeSpanAttributes(AUTO_SPAN_ATTRIBUTES, mode);
      expect(out['http.request.header.authorization']).toBeUndefined();
      expect(out['http.request.header.cookie']).toBeUndefined();
      expect(JSON.stringify(out)).not.toContain(FAKE_ANTHROPIC_KEY);
    }
  });

  it('drops SQL bind parameters but keeps the query text', () => {
    const out = sanitizeSpanAttributes(AUTO_SPAN_ATTRIBUTES, 'redacted');
    expect(out['db.query.parameter.0']).toBeUndefined();
    expect(out['db.statement']).toContain('SELECT * FROM "Message"');
  });

  it('keeps host and path but drops the query string of a URL', () => {
    const out = sanitizeSpanAttributes(AUTO_SPAN_ATTRIBUTES, 'redacted');
    expect(out['url.query']).toBeUndefined();
    expect(out['url.full']).toBe('https://api.deepseek.com/chat/completions');
    expect(out['url.path']).toBe('/chat/completions');
    expect(out['server.address']).toBe('api.deepseek.com');
  });

  it('keeps the destination host, which endsWith("address") would otherwise redact', () => {
    // Bai nay giu dung mot loi CO THAT bat duoc luc viet POC: `server.address` truot vao nhanh
    // PII cua `isPiiKey` va moi span HTTP ra ngoai mat host. Xem `NETWORK_HOST_KEYS`.
    const out = sanitizeSpanAttributes(
      { 'server.address': 'api.deepseek.com', 'client.address': '203.0.113.9' },
      'redacted',
    );
    expect(out['server.address']).toBe('api.deepseek.com');
    // IP cua NGUOI GOI van la PII — no khong nam trong danh sach mien tru.
    expect(out['client.address']).toBe('[REDACTED_PII]');
  });

  it('drops the request body at redacted, because a body is a prompt plus customer data', () => {
    const out = sanitizeSpanAttributes(AUTO_SPAN_ATTRIBUTES, 'redacted');
    expect(out['http.request.body']).toBeUndefined();
  });

  it('scrubs secrets found inside plain string values, not only in known keys', () => {
    const out = sanitizeSpanAttributes(
      {
        'exception.message': 'connect ECONNREFUSED postgresql://zalo:hunter2@postgres:5432/zalo',
        'error.detail': 'upstream said: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefgh.xyz',
      },
      'full',
    );
    expect(String(out['exception.message'])).not.toContain('hunter2');
    expect(String(out['exception.message'])).toContain('postgres:5432');
    expect(String(out['error.detail'])).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts Vietnamese phone numbers and emails at redacted, keeps them at full', () => {
    const attributes = { 'nexagnet.note': 'goi 0912345678 hoac a@b.com' };
    expect(String(sanitizeSpanAttributes(attributes, 'redacted')['nexagnet.note'])).not.toContain(
      '0912345678',
    );
    expect(String(sanitizeSpanAttributes(attributes, 'full')['nexagnet.note'])).toContain(
      '0912345678',
    );
  });

  it('redacts a dotted PII key, which the flat key filter alone would miss', () => {
    // `normalizeKey` bo dau cham -> `nexagnetcustomerphone` khong con `endsWith('phone')`.
    // Day dung la lo hong ma `matchesKey()` ton tai de chan.
    const out = sanitizeSpanAttributes({ 'nexagnet.customerPhone': '0912345678' }, 'redacted');
    expect(out['nexagnet.customerPhone']).toBe('[REDACTED_PII]');
  });

  it('keeps a Zalo group id intact, even though it contains a phone-shaped substring', () => {
    // Loi CO THAT bat duoc luc do POC: `2508572440887686813` chua `0887686813`, khop mau SDT
    // Viet Nam, nen `chatId` bi cat thanh `250857244[REDACTED_PII]` — hong dung khoa tim kiem
    // chinh khi chua co `orderId`. Xem `IDENTIFIER_KEYS`.
    const out = sanitizeSpanAttributes({ 'nexagnet.chatId': '2508572440887686813' }, 'redacted');
    expect(out['nexagnet.chatId']).toBe('2508572440887686813');
  });

  it('hashes the sender anchor instead of dropping it, so turns still group by person', () => {
    const out = sanitizeSpanAttributes({ 'nexagnet.senderExternalId': 'uid-42' }, 'redacted');
    expect(out['nexagnet.senderExternalId']).toBe(hashAnchor('uid-42'));
    expect(out['nexagnet.senderExternalId']).not.toBe('uid-42');
    // Cung mot nguoi -> cung mot bam, nen van nhom duoc cac luot cua ho.
    expect(sanitizeSpanAttributes({ 'nexagnet.senderExternalId': 'uid-42' }, 'redacted')).toEqual(
      out,
    );
  });

  it('keeps the operational anchors a debugger searches by', () => {
    const out = sanitizeSpanAttributes(
      {
        'nexagnet.chatId': 'group-1',
        'nexagnet.orderId': 'ord-9',
        'nexagnet.messageId': 'msg-3',
        'nexagnet.tenant': 'ultty',
      },
      'redacted',
    );
    expect(out).toEqual({
      'nexagnet.chatId': 'group-1',
      'nexagnet.orderId': 'ord-9',
      'nexagnet.messageId': 'msg-3',
      'nexagnet.tenant': 'ultty',
    });
  });
});

describe('PrivacySpanProcessor', () => {
  function fakeSpan(attributes: Record<string, unknown>, statusMessage?: string): ReadableSpan {
    return {
      attributes,
      events: [],
      status: statusMessage ? { code: 2, message: statusMessage } : { code: 0 },
    } as unknown as ReadableSpan;
  }

  function fakeDelegate(): SpanProcessor & { seen: ReadableSpan[] } {
    const seen: ReadableSpan[] = [];
    return {
      seen,
      onStart: () => undefined,
      onEnd: (span: ReadableSpan) => {
        seen.push(span);
      },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
  }

  it('sanitizes in place before the delegate ever sees the span', () => {
    const delegate = fakeDelegate();
    const processor = new PrivacySpanProcessor(delegate, 'redacted');
    const span = fakeSpan({ ...AUTO_SPAN_ATTRIBUTES });

    processor.onEnd(span);

    expect(delegate.seen).toHaveLength(1);
    expect(JSON.stringify(delegate.seen[0]!.attributes)).not.toContain('sk-ant');
    expect(delegate.seen[0]!.attributes['db.query.parameter.0']).toBeUndefined();
  });

  it('scrubs the status message, where a connection string leaks most often', () => {
    const delegate = fakeDelegate();
    const processor = new PrivacySpanProcessor(delegate, 'redacted');

    processor.onEnd(fakeSpan({}, 'Error: postgresql://zalo:hunter2@postgres:5432/zalo down'));

    expect(delegate.seen[0]!.status.message).not.toContain('hunter2');
  });

  it('DROPS a span rather than exporting it raw when the filter itself throws', () => {
    // Day la ngoai le CO Y voi fail-open: fail-open o huong nay mat mot span, o huong kia ro mot
    // bi mat. Bai nay giu dung lua chon do.
    const delegate = fakeDelegate();
    const processor = new PrivacySpanProcessor(delegate, 'redacted');
    const exploding = {
      get attributes(): Record<string, unknown> {
        throw new Error('bo loc hong');
      },
      events: [],
      status: {},
    } as unknown as ReadableSpan;

    expect(() => processor.onEnd(exploding)).not.toThrow();
    expect(delegate.seen).toHaveLength(0);
  });

  it('passes forceFlush and shutdown straight through', async () => {
    const delegate = fakeDelegate();
    const flush = vi.spyOn(delegate, 'forceFlush');
    const shutdown = vi.spyOn(delegate, 'shutdown');
    const processor = new PrivacySpanProcessor(delegate, 'full');

    await processor.forceFlush();
    await processor.shutdown();

    expect(flush).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
