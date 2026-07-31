import process from 'node:process';
import { FlowiseParser } from '../../apps/api/dist/pipeline/flowise-parser.js';

const baseUrl = requiredEnv('FLOWISE_BASE_URL').replace(/\/+$/, '');
const flowId = requiredEnv('FLOWISE_FLOW_ID');
const apiKey = requiredEnv('FLOWISE_API_KEY');
const predictionUrl = `${baseUrl}/api/v1/prediction/${encodeURIComponent(flowId)}`;
const input = {
  text: 'HN_31.7_Meta HN, 2 x Ghe Felix',
  imageUrl: undefined,
  products: [
    {
      sku: 'GHE-FELIX',
      name: 'Ghế nâng an toàn trẻ em EUS Felix',
      aliases: ['felix', 'ghe felix'],
      unit: 'cái',
    },
  ],
  glossary: [{ term: 'HN', meaning: 'Hà Nội' }],
  dealerNameRaw: 'Meta HN',
  botName: 'Bot NetViet',
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
