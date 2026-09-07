import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChatCompletionsReceiptExtractor } from './fuel-receipt-extraction.http.js';
import { StubFuelReceiptExtractor } from './fuel-receipt-extraction.stub.js';
import {
  CONFIDENCE_SCALE,
  FIELD_CONFIDENCE_FLOOR,
  RECEIPT_REJECT_REASONS,
} from './fuel-receipt-extraction.js';
import {
  guardReceiptImage,
  sniffReceiptMediaType,
  MAX_RECEIPT_BYTES,
} from './fuel-receipt-image.js';

/**
 * C3 — CONG DOC ANH.
 *
 * Bo nay do BA thu, va deu do bang HANH VI chu khong bang mot loi hua trong chu thich:
 *   1. Ranh gioi: byte gi duoc di tiep, byte gi bi chan, va chan voi ma nao.
 *   2. Tinh TRUNG LAP NHA CUNG CAP: adapter HTTP chay voi mot may chu `node:http` dung tam ngay
 *      trong bai test. Neu no can biet ten mot nha cung cap nao de chay, bai nay do.
 *   3. "Ket qua chi la UNG VIEN": khong duong nao o day sinh ra mot phieu do dau.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]);
/** Mot vo RIFF KHONG phai WebP — day la cach mot tep am thanh co the tra hinh thanh mot buc anh. */
const WAV = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE'),
]);

const image = (content: Buffer, mediaType = 'image/jpeg') => ({
  sourceRef: 'phieu.jpg',
  mediaType,
  content,
});

describe('C3 §1 — ranh gioi: byte noi that, ten tep thi khong', () => {
  it('IMG-01 nhan ra JPEG tu byte dau', () => {
    expect(sniffReceiptMediaType(JPEG)).toBe('image/jpeg');
  });

  it('IMG-02 nhan ra PNG tu tam byte dau', () => {
    expect(sniffReceiptMediaType(PNG)).toBe('image/png');
  });

  it('IMG-03 nhan ra WebP bang CA vo RIFF lan nhan WEBP', () => {
    expect(sniffReceiptMediaType(WEBP)).toBe('image/webp');
  });

  it('IMG-04 mot vo RIFF khong kem nhan WEBP KHONG duoc coi la anh', () => {
    expect(sniffReceiptMediaType(WAV)).toBeNull();
  });

  it('IMG-05 mot tep HTML mang duoi .jpg bi tu choi CO TEN', () => {
    const html = Buffer.from('<!doctype html><html><body>khong phai anh</body></html>');
    expect(guardReceiptImage(image(html))).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('IMG-06 loi khai LECH voi byte bi tu choi, khong duoc "sua giup"', () => {
    // Byte la PNG that, nhung nguoi goi khai JPEG. Doan y nguoi goi o day se giau mot cho hong o
    // phia goi cho den khi no lo ra o mot cho dat hon.
    expect(guardReceiptImage(image(PNG, 'image/jpeg'))).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('IMG-07 tep rong tra ve EMPTY, khong phai UNSUPPORTED_MEDIA_TYPE', () => {
    expect(guardReceiptImage(image(Buffer.alloc(0)))).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('IMG-08 vuot tran bi chan TRUOC khi doc byte — mot tep 200 MB khong duoc sniff', () => {
    const huge = { ...image(JPEG), content: Buffer.alloc(MAX_RECEIPT_BYTES + 1) };
    expect(guardReceiptImage(huge)).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('IMG-09 tran anh RONG HON tran cua hoa don XML — mot anh dien thoai that phai lot qua', () => {
    // 2 MB la tran cua duong XML. Mot anh chup bang dien thoai doi nay thuong lon hon the.
    expect(MAX_RECEIPT_BYTES).toBeGreaterThan(2_000_000);
  });
});

describe('C3 §2 — bo doc TAT DINH: khong mang, khong doan, khong im lang', () => {
  const stub = new StubFuelReceiptExtractor();

  it('IMG-10 cung mot buc anh cho CUNG mot so hoa don', async () => {
    const first = await stub.extract(image(JPEG));
    const second = await stub.extract(image(JPEG));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.invoice.number).toBe(second.invoice.number);
  });

  it('IMG-11 hai buc anh KHAC nhau cho hai so hoa don khac nhau', async () => {
    const first = await stub.extract(image(JPEG));
    const second = await stub.extract(image(PNG, 'image/png'));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.invoice.number).not.toBe(second.invoice.number);
  });

  it('IMG-12 bo tat dinh VAN kiem ranh gioi — no khong duoc de dai hon duong that', async () => {
    const result = await stub.extract(image(WAV));
    expect(result).toEqual({ ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('IMG-13 mot o CO Y nam duoi san, de duong "muc tin thap" cua C4 nhin thay duoc', async () => {
    const result = await stub.extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const weak = Object.entries(result.confidence).filter(
      ([, value]) => value < FIELD_CONFIDENCE_FLOOR,
    );
    expect(weak).toHaveLength(1);
    expect(weak[0]?.[0]).toBe('line.1.unitPriceMilli');
  });

  it('IMG-14 so hoc cua ban tat dinh KHOP — no khong duoc gay bao dong gia', async () => {
    const result = await stub.extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.invoice.lines[0];
    expect(line).toBeDefined();
    if (!line || line.litersUnits === null || line.unitPriceUnits === null) return;
    // (mililit x mili-dong) / 1e6 = dong.
    expect(Math.round((line.litersUnits * line.unitPriceUnits) / 1_000_000)).toBe(line.amount);
  });
});

/**
 * §3 — MOT MAY CHU KHONG TEN.
 *
 * Toan bo bo nay chay voi mot `node:http` server viet trong chinh tep test. Adapter khong biet no
 * dang noi voi ai; cai duy nhat no biet la mot `baseUrl` va mot ten mo hinh. Do la dinh nghia THAT
 * cua "trung lap nha cung cap", va no do duoc chu khong chi hua duoc.
 */
/** Than yeu cau ma may chu ghi lai — chi nhung manh ma bo test that su doc. */
interface SeenBody {
  readonly model: string;
  readonly temperature: number;
  readonly messages: readonly {
    readonly content: readonly {
      readonly type: string;
      readonly image_url?: { readonly url: string };
    }[];
  }[];
}

describe('C3 §3 — adapter HTTP chay voi mot may chu khong ten', () => {
  let server: Server;
  let baseUrl: string;
  let reply: unknown = null;
  let status = 200;
  let seenBody: SeenBody | null = null;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        seenBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SeenBody;
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });

  afterAll(() => {
    server.close();
  });

  const extractorFor = (timeoutMs = 5_000) =>
    new ChatCompletionsReceiptExtractor({ baseUrl, model: 'mot-mo-hinh-nao-do', timeoutMs });

  const GOOD_REPLY = {
    sellerTaxCode: '0101234567',
    invoiceSymbol: 'C26TAA',
    invoiceNo: '00007788',
    issuedAt: '2026-09-02T09:15:00',
    sellerName: 'CUA HANG XANG DAU SO 5',
    plateHintRaw: '29C-123.45',
    lines: [
      {
        itemName: 'Dau DO 0,05S-II',
        unit: 'Lit',
        litersMilli: 40_000,
        unitPriceMilli: 21_500_000,
        amountVnd: 860_000,
      },
    ],
    confidence: {
      sellerTaxCode: 980,
      invoiceNo: 640,
      'line.1.amountVnd': CONFIDENCE_SCALE,
    },
  };

  it('HTTP-01 doc duoc mot cau tra loi dung khuon', async () => {
    reply = GOOD_REPLY;
    status = 200;
    const result = await extractorFor().extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.sellerTaxCode).toBe('0101234567');
    expect(result.invoice.number).toBe('00007788');
    expect(result.invoice.lines[0]?.litersUnits).toBe(40_000);
  });

  it('HTTP-02 goi dung khuon `chat/completions` voi mot MANG khoi text + image_url', () => {
    expect(seenBody?.model).toBe('mot-mo-hinh-nao-do');
    const content = seenBody?.messages[0]?.content ?? [];
    expect(content[0]?.type).toBe('text');
    expect(content[1]?.type).toBe('image_url');
    expect(content[1]?.image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('HTTP-03 `temperature: 0` — mot bo doc so lieu khong duoc sang tao', () => {
    expect(seenBody?.temperature).toBe(0);
  });

  it('HTTP-04 bien so tu ANH van di duong GOI Y, khong mo mot duong rieng', async () => {
    reply = GOOD_REPLY;
    const result = await extractorFor().extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.extensions.BienSoXe).toBe('29C-123.45');
  });

  it('HTTP-05 muc tin duoc giu NGUYEN theo tung o, khong gop thanh mot con so', async () => {
    reply = GOOD_REPLY;
    const result = await extractorFor().extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence.invoiceNo).toBe(640);
    expect(result.confidence.sellerTaxCode).toBe(980);
  });

  it('HTTP-06 o mo hinh KHONG bao muc tin thi VANG MAT, khong duoc coi la chac chan', async () => {
    reply = GOOD_REPLY;
    const result = await extractorFor().extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence.invoiceSymbol).toBeUndefined();
  });

  it('HTTP-07 vet xuat xu ghi KHOA TRONG CAU TRA LOI, khong mot duong dan XML gia', async () => {
    reply = GOOD_REPLY;
    const result = await extractorFor().extract(image(JPEG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.provenance.invoiceNo?.path).toBe('invoiceNo');
    expect(result.invoice.provenance.invoiceNo?.raw).toBe('00007788');
  });

  it('HTTP-08 thieu DANH TINH hoa don -> tu choi CO TEN, khong nhap voi o rong', async () => {
    reply = { ...GOOD_REPLY, invoiceNo: '' };
    const result = await extractorFor().extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_MALFORMED_OUTPUT' });
  });

  it('HTTP-09 khong dong hang nao -> tu choi, khong tao mot chung tu rong', async () => {
    reply = { ...GOOD_REPLY, lines: [] };
    const result = await extractorFor().extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_MALFORMED_OUTPUT' });
  });

  it('HTTP-10 so THUC o o so lit bi tu choi — quy uoc so nguyen duoc ep o mat giao tiep', async () => {
    reply = { ...GOOD_REPLY, lines: [{ ...GOOD_REPLY.lines[0], litersMilli: 40.5 }] };
    const result = await extractorFor().extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_MALFORMED_OUTPUT' });
  });

  it('HTTP-11 muc tin ngoai thang 0..1000 bi tu choi', async () => {
    reply = { ...GOOD_REPLY, confidence: { invoiceNo: 1_500 } };
    const result = await extractorFor().extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_MALFORMED_OUTPUT' });
  });

  it('HTTP-12 dich vu tra loi 500 -> EXTRACTION_UNAVAILABLE, KHAC han sai khuon', async () => {
    status = 500;
    reply = GOOD_REPLY;
    const result = await extractorFor().extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_UNAVAILABLE' });
    status = 200;
  });

  it('HTTP-13 khong voi toi duoc dich vu -> EXTRACTION_UNAVAILABLE, khong nem ra ngoai', async () => {
    const offline = new ChatCompletionsReceiptExtractor({
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'mot-mo-hinh-nao-do',
      timeoutMs: 1_000,
    });
    const result = await offline.extract(image(JPEG));
    expect(result).toEqual({ ok: false, reason: 'EXTRACTION_UNAVAILABLE' });
  });

  it('HTTP-14 KHONG mot ten nha cung cap nao trong ma nguon cua adapter', async () => {
    const source = await readFile(join(HERE, 'fuel-receipt-extraction.http.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const vendor of [
      'anthropic',
      'openai',
      'deepseek',
      'google',
      'gemini',
      'azure',
      'baidu',
    ]) {
      expect(code.toLowerCase()).not.toContain(vendor);
    }
  });

  it('HTTP-15 nam ly do tu choi cua duong anh KHONG gom mot ma nao cua duong XML', () => {
    expect([...RECEIPT_REJECT_REASONS]).toEqual([
      'EMPTY',
      'TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'EXTRACTION_UNAVAILABLE',
      'EXTRACTION_MALFORMED_OUTPUT',
    ]);
  });
});
