/**
 * Golden eval harness cho cổng go-live parser/rules.
 *
 * Chạy:
 *   GOLDEN_DATASET_PATH=/abs/path/golden-orders.json pnpm --filter @netviet/poc-parser eval
 *
 * Dataset là external input của khách, không commit vào source. Nếu thiếu dataset, tool trả
 * GO_LIVE_READY=false reason=missing_golden_dataset và exit code 2 để CI/readiness gate phân biệt
 * với mismatch thật (exit code 1).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeGoldenMetrics,
  missingGoldenDatasetResult,
  parseGoldenDataset,
  type GoldenCase,
  type OrderViewLike,
} from './eval-core.js';
import { writeEvalReport } from './eval-report.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const THROTTLE_MS = Number(process.env.EVAL_THROTTLE_MS ?? 300);
const GOLDEN_DATASET_PATH = process.env.GOLDEN_DATASET_PATH ?? process.env.EVAL_GOLDEN_PATH;
const EVAL_REPORT_PATH = process.env.EVAL_REPORT_PATH;
const DEFAULT_CHAT_ID = process.env.EVAL_CHAT_ID;

async function simulate(testCase: GoldenCase): Promise<OrderViewLike> {
  const chatId = testCase.chatId ?? DEFAULT_CHAT_ID;
  if (!chatId) {
    throw new Error('EVAL_CHAT_ID bat buoc neu golden case khong co chatId');
  }
  const res = await fetch(`${API_URL}/demo/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testCase.text, chatId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as OrderViewLike;
}

const sleep = (ms: number): Promise<void> => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main(): Promise<void> {
  if (!GOLDEN_DATASET_PATH) {
    output(missingGoldenDatasetResult());
    process.exitCode = 2;
    return;
  }
  const path = resolve(GOLDEN_DATASET_PATH);
  if (!existsSync(path)) {
    output({ goLiveReady: false, reason: 'missing_golden_dataset', path });
    process.exitCode = 2;
    return;
  }

  const cases = parseGoldenDataset(JSON.parse(readFileSync(path, 'utf8')));
  const views: OrderViewLike[] = [];
  for (let index = 0; index < cases.length; index++) {
    const view = await simulate(cases[index]!);
    views.push(view);
    process.stdout.write('.');
    if (index < cases.length - 1) await sleep(THROTTLE_MS);
  }
  process.stdout.write('\n');

  const result = computeGoldenMetrics(cases, views);
  output(result);
  process.exitCode = result.goLiveReady ? 0 : 1;
}

void main().catch((error: unknown) => {
  output({
    goLiveReady: false,
    reason: 'eval_failed',
    error: error instanceof Error ? error.message : String(error),
  }, true);
  process.exitCode = 1;
});

function output<T extends object>(result: T, stderr = false): void {
  const report = { ...result, evaluatedAt: new Date().toISOString() };
  const serialized = JSON.stringify(report, null, 2);
  if (stderr) console.error(serialized);
  else console.log(serialized);
  if (!EVAL_REPORT_PATH) return;

  writeEvalReport(EVAL_REPORT_PATH, serialized);
}
