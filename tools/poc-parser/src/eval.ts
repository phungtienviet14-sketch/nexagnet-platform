/**
 * Eval harness — do do on dinh phan loai intent cua parser (DeepSeek/Claude/mock)
 * qua DUNG pipeline that: goi API /demo/simulate cho tung tin trong eval-set.json,
 * so intent thu duoc voi expectedIntent, in bang do chinh xac + danh sach sai.
 *
 * Cach dung (can API dang chay, PARSER_MODE=deepseek de do AI that):
 *   pnpm --filter @ultty/poc-parser eval
 * Bien moi truong: API_URL (mac dinh http://localhost:3001), EVAL_CHAT_ID, EVAL_THROTTLE_MS.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface EvalCase {
  text: string;
  expectedIntent: string;
  notes: string;
}

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const CHAT_ID = process.env.EVAL_CHAT_ID ?? 'zgr-f8a7101d77709e2ec761'; // nhom Meta HN (dai_ly)
const THROTTLE_MS = Number(process.env.EVAL_THROTTLE_MS ?? 300);
const TARGET_ACCURACY = 90;

const cases: EvalCase[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../eval-set.json'), 'utf8'),
);

async function classify(text: string): Promise<{ intent: string; llmCalls: number }> {
  const res = await fetch(`${API_URL}/demo/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, chatId: CHAT_ID }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const view = (await res.json()) as { intent: string; trace?: { llmCalls: number; brainMode: string } };
  return { intent: view.intent, llmCalls: view.trace?.llmCalls ?? 0 };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`Eval ${cases.length} tin qua ${API_URL}/demo/simulate (nhom Meta HN)\n`);
  const perIntent = new Map<string, { ok: number; total: number }>();
  const mismatches: { text: string; expected: string; got: string }[] = [];
  let brain = '?';

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    let got = 'ERROR';
    try {
      const r = await classify(c.text);
      got = r.intent;
      brain = r.llmCalls > 0 ? 'llm' : 'mock';
    } catch (e) {
      got = `ERROR:${e instanceof Error ? e.message : String(e)}`;
    }
    const bucket = perIntent.get(c.expectedIntent) ?? { ok: 0, total: 0 };
    bucket.total++;
    const ok = got === c.expectedIntent;
    if (ok) bucket.ok++;
    else mismatches.push({ text: c.text, expected: c.expectedIntent, got });
    perIntent.set(c.expectedIntent, bucket);
    process.stdout.write(ok ? '.' : 'x');
    if (i < cases.length - 1) await sleep(THROTTLE_MS);
  }
  console.log('\n');

  let totalOk = 0;
  let total = 0;
  console.log('| Intent | Đúng/Tổng | % |');
  console.log('|---|---|---|');
  for (const intent of [...perIntent.keys()].sort()) {
    const s = perIntent.get(intent)!;
    totalOk += s.ok;
    total += s.total;
    console.log(`| ${intent} | ${s.ok}/${s.total} | ${Math.round((s.ok / s.total) * 100)}% |`);
  }
  const acc = Math.round((totalOk / total) * 100);
  console.log(`| **TỔNG** | **${totalOk}/${total}** | **${acc}%** |`);

  if (mismatches.length) {
    console.log(`\nSai (${mismatches.length}):`);
    for (const m of mismatches) console.log(`  [${m.expected} → ${m.got}]  "${m.text}"`);
  }
  console.log(`\nParser brain: ${brain}. Ngưỡng đề xuất demo: intent-accuracy ≥ ${TARGET_ACCURACY}%.`);
  console.log(acc >= TARGET_ACCURACY ? '✅ ĐẠT ngưỡng.' : '⚠️ CHƯA đạt — cần tune prompt / few-shot.');
}

void main();
