import process from 'node:process';
import { FlowiseParser } from '../../apps/api/dist/pipeline/flowise-parser.js';

const baseUrl = requiredEnv('FLOWISE_BASE_URL').replace(/\/+$/, '');
const flowId = requiredEnv('FLOWISE_FLOW_ID');
const apiKey = requiredEnv('FLOWISE_API_KEY');
const predictionUrl = `${baseUrl}/api/v1/prediction/${encodeURIComponent(flowId)}`;
// DU LIEU GIA, CO Y. File nay nam trong `deploy/` — phan dung chung cho MOI khach — nen no khong
// duoc mang SKU, ten san pham hay ten dai ly cua bat ky khach nao (nguyen tac #6 trong CLAUDE.md).
// Truoc 17/08/2026 cho nay dung don that cua khach dau tien, tuc la ky su cua moi khach ve sau doc
// repo la thay bang hang va ten dai ly cua ho.
//
// Parser lam viec trong TU DIEN DONG: danh muc duoi day duoc truyen thang vao request, nen test
// khong phu thuoc nguon su that cua khach nao. Doi cho nay thi giu nguyen HINH DANG don (mau TH1:
// `ChiNhanh_Ngay_TenDaiLy, SoLuong x MaSP`) — do moi la thu dang duoc kiem.
const input = {
  text: 'HN_31.7_Dai Ly Mau, 2 x Ban Mau',
  imageUrl: undefined,
  products: [
    {
      sku: 'SP-MAU-01',
      name: 'Bàn mẫu dùng cho contract test',
      aliases: ['ban mau', 'ban mau 01'],
      unit: 'cái',
    },
  ],
  glossary: [{ term: 'HN', meaning: 'Hà Nội' }],
  dealerNameRaw: 'Dai Ly Mau',
  botName: 'Bot Contract Test',
};

const unauthenticated = await fetch(predictionUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(toPredictionBody(input)),
});
await assertBlocked(unauthenticated, 'request thieu key');

const wrongKey = await fetch(predictionUrl, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer contract-key-sai',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(toPredictionBody(input)),
});
await assertBlocked(wrongKey, 'key sai');

const parser = new FlowiseParser({
  baseUrl,
  flowId,
  apiKey,
  timeoutMs: 30_000,
});
const parsed = await parser.parse(input);
if (parsed.intent !== 'dat_don' || !parsed.order || parsed.order.items.length !== 1) {
  throw new Error(`Contract output khong dung don test: intent=${parsed.intent}`);
}

process.stdout.write(
  `Flowise contract OK: auth bat buoc, artifact import duoc, output hop schema (${parsed.intent}).\n`,
);

function toPredictionBody(parserInput) {
  return {
    form: {
      text: parserInput.text,
      imageUrl: parserInput.imageUrl ?? '',
      productsJson: JSON.stringify(parserInput.products),
      glossaryJson: JSON.stringify(parserInput.glossary),
      dealerNameRaw: parserInput.dealerNameRaw ?? '',
      botName: parserInput.botName ?? '',
    },
    streaming: false,
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thieu bien bat buoc ${name}.`);
  return value;
}

async function assertBlocked(response, label) {
  if (response.ok) {
    throw new Error(`Prediction API khong chan ${label}: HTTP ${response.status}`);
  }
  const body = (await response.text()).toLowerCase();
  if (!body.includes('unauthorized')) {
    throw new Error(`Prediction API chan ${label} nhung khong bao unauthorized: HTTP ${response.status}`);
  }
}
