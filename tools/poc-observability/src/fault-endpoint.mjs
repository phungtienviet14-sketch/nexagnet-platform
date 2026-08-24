#!/usr/bin/env node
/**
 * MAY CHU GAY LOI CO DIEU KHIEN — dong ba vai cung luc, tat ca deu do POC dieu khien:
 *
 *   1. `/api/v1/prediction/:flowId` — gia lam Flowise (tang LLM). Doi duoc giua `ok` / `http500`
 *      / `timeout` / `badjson` de dung ba kich ban loi ma khong cham vao code nghiep vu.
 *   2. `/external/handoff`          — gia lam he ngoai ma worker Hatchet POST toi. Doi duoc
 *      giua `ok` / `flaky503` de do duong retry, va DEM tac dung phu theo `Idempotency-Key`.
 *   3. `/control`                   — doi che do luc dang chay; `/state` — doc bo dem.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI CO NO, thay vi tro thang vao DeepSeek roi cho no hong:
 *
 * `DEEPSEEK_URL` la HANG SO trong module (`deepseek-parser.ts:36`) — khong tro di dau duoc.
 * `FlowiseParser` thi nhan `FLOWISE_BASE_URL` tu bien moi truong, nen no la duong LLM DUY NHAT
 * co that trong repo ma POC dieu khien duoc. Ca hai deu goi bang `fetch` toan cuc (undici), tuc
 * ca hai deu duoc `instrumentation-undici` nhin thay y het nhau — nen do tren Flowise la do dung
 * cai can do, khong phai mot ban thay the gan giong.
 *
 * Chay:  node src/fault-endpoint.mjs --port 4799
 */
import { createServer } from 'node:http';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(arg('port', '4799'));

const state = {
  llmMode: 'ok', // ok | http500 | timeout | badjson
  externalMode: 'ok', // ok | flaky503
  llmCalls: 0,
  externalCalls: 0,
  externalFailures: 0,
  /** `Idempotency-Key` -> so lan tac dung phu DA THUC HIEN. Bat bien: khong khoa nao vuot qua 1. */
  sideEffects: {},
};

/** ParseResult hop le cho mot don TH1 don gian — dung SKU co that trong goi khach Ultty. */
function okParseResult(text) {
  const quantity = Number(/(\d+)/.exec(text ?? '')?.[1] ?? 2);
  return {
    json: {
      intent: 'dat_don',
      order: {
        orderType: 'TH1',
        items: [{ skuRaw: 'V08', quantity }],
        totalRaw: 0,
      },
      confidence: { intent: 0.95 },
    },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const body = await readBody(req);

  if (url.pathname === '/state') return json(res, 200, state);

  if (url.pathname === '/control') {
    const next = body ? JSON.parse(body) : {};
    if (next.llmMode) state.llmMode = next.llmMode;
    if (next.externalMode) state.externalMode = next.externalMode;
    if (next.reset) {
      state.llmCalls = 0;
      state.externalCalls = 0;
      state.externalFailures = 0;
      state.sideEffects = {};
    }
    process.stdout.write(`[fault] llm=${state.llmMode} external=${state.externalMode}\n`);
    return json(res, 200, state);
  }

  if (url.pathname.startsWith('/api/v1/prediction/')) {
    state.llmCalls += 1;
    const parsed = body ? JSON.parse(body) : {};
    const text = parsed?.form?.text ?? '';
    process.stdout.write(`[fault] llm #${state.llmCalls} mode=${state.llmMode}\n`);
    if (state.llmMode === 'http500') return json(res, 500, { error: 'upstream model unavailable' });
    if (state.llmMode === 'badjson') return json(res, 200, { json: { intent: 'khong_ton_tai' } });
    if (state.llmMode === 'timeout') return; // treo — de `AbortSignal.timeout` cua parser no ra
    return json(res, 200, okParseResult(text));
  }

  if (url.pathname === '/external/handoff') {
    state.externalCalls += 1;
    const key = req.headers['idempotency-key'] ?? `khong-khoa-${state.externalCalls}`;
    // HAI LAN 503 ROI 200. `flaky503` tu chuyen sang phuc vu sau lan hong thu hai de duong retry
    // ket thuc duoc — POC can thay CA ba lan thu trong CUNG mot cay trace.
    if (state.externalMode === 'flaky503' && state.externalFailures < 2) {
      state.externalFailures += 1;
      process.stdout.write(
        `[fault] external #${state.externalCalls} -> 503 (lan ${state.externalFailures})\n`,
      );
      return json(res, 503, { error: 'tam thoi khong phuc vu' });
    }
    // DEM TAC DUNG PHU theo khoa — day la thu chung minh "retry khong nhan doi", chu khong phai
    // so lan goi HTTP (goi lai la binh thuong; lam viec hai lan moi la loi).
    state.sideEffects[key] = (state.sideEffects[key] ?? 0) + 1;
    process.stdout.write(
      `[fault] external #${state.externalCalls} -> 200, khoa=${key}, tac dung phu=${state.sideEffects[key]}\n`,
    );
    return json(res, 200, { ok: true, idempotencyKey: key, applied: state.sideEffects[key] });
  }

  return json(res, 404, { error: 'khong co duong nay' });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`[fault] nghe http://127.0.0.1:${port}\n`);
});
