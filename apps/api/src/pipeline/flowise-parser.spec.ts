import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParserInput } from './order-parser.js';
import { FlowiseParser } from './flowise-parser.js';

const input: ParserInput = {
  text: 'HN_30.6_Meta HN, 2 x Ghe Felix',
  imageUrl: 'https://example.test/order.jpg',
  products: [{ sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix'], unit: 'cái' }],
  glossary: [{ term: 'HN', meaning: 'Hà Nội' }],
  dealerNameRaw: 'Meta HN',
  botName: 'Bot NetViet',
};

const validResult = {
  intent: 'dat_don',
  order: {
    orderType: 'TH1',
    dealerNameRaw: 'Meta HN',
    items: [{ skuRaw: 'Ghe Felix', quantity: 2 }],
    noVat: false,
  },
  confidence: { intent: 0.97 },
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function parser(timeoutMs = 30_000): FlowiseParser {
  return new FlowiseParser({
    baseUrl: 'http://flowise:3000/',
    flowId: 'zalo/order parser',
    apiKey: 'test-key',
    timeoutMs,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('FlowiseParser', () => {
  it('gui dung Prediction API contract va chi goi Flowise mot lan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { json: validResult }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await parser().parse(input);

    expect(result).toEqual(validResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://flowise:3000/api/v1/prediction/zalo%2Forder%20parser');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      form: {
        text: input.text,
        imageUrl: input.imageUrl,
        productsJson: JSON.stringify(input.products),
        glossaryJson: JSON.stringify(input.glossary),
        dealerNameRaw: input.dealerNameRaw,
        botName: input.botName,
      },
      streaming: false,
    });
  });

  it('unwrap dung mot phan tu trong response.json.result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          text: JSON.stringify({ result: [validResult] }),
          json: { result: [validResult] },
        }),
      ),
    );

    await expect(parser().parse(input)).resolves.toEqual(validResult);
  });

  it.each([401, 404, 429, 500])('HTTP %s -> nem loi de ingest retry, khong fallback mock', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, { error: 'failure' })));

    await expect(parser().parse(input)).rejects.toThrow(`Flowise HTTP ${status}`);
  });

  it('response JSON sai parseResultSchema -> nem loi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { json: { intent: 'tu_bia' } })));

    await expect(parser().parse(input)).rejects.toThrow('khong hop parseResultSchema');
  });

  it('khong chap nhan response.text tu do', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { text: JSON.stringify(validResult) })));

    await expect(parser().parse(input)).rejects.toThrow('khong co structured output');
  });

  it('khong doc structured output tu execution trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          agentFlowExecutedData: [{ data: { output: { result: [validResult] } } }],
        }),
      ),
    );

    await expect(parser().parse(input)).rejects.toThrow('khong co structured output');
  });

  it('het timeout -> nem loi co ngu canh Flowise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError')),
    );

    await expect(parser(10).parse(input)).rejects.toThrow('Goi Flowise that bai');
  });
});
