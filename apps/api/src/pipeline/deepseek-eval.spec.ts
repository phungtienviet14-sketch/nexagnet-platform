import { describe, expect, it } from 'vitest';
import { loadEnv } from '@netviet/shared';
import { SEED } from '../knowledge/seed.js';
import { DeepSeekParser } from './deepseek-parser.js';

/**
 * Eval THAT goi DeepSeek — chi chay khi RUN_LLM_TESTS=1 + co DEEPSEEK_API_KEY.
 * Mac dinh SKIP (khong tinh phi API trong CI). Verify demo AI-that phan loai on dinh.
 * Do sau/rong hon: `pnpm --filter @netviet/poc-parser eval` (35 tin).
 */
const env = loadEnv();
const shouldRun = process.env.RUN_LLM_TESTS === '1' && Boolean(env.DEEPSEEK_API_KEY);
const suite = shouldRun ? describe : describe.skip;

const CASES: { text: string; intent: string }[] = [
  { text: 'gui 10 ghe felix ve TN cho c, ko VAT', intent: 'dat_don' },
  { text: 'ghe felix bao nhieu tien c oi', intent: 'hoi_gia' },
  { text: 'ghe felix co tot khong c oi', intent: 'hoi_san_pham' },
  { text: 'thang nay cho cong no 45 ngay dc ko', intent: 'chinh_sach_cong_no' },
  { text: 'khi nao hang toi TN v a', intent: 'van_chuyen' },
  { text: 'noi chien moi mua hom qua bi loi doi dc ko', intent: 'bao_hanh_khieu_nai' },
  { text: 'chao shop', intent: 'khac' },
];

suite('DeepSeekParser — eval AI thật (RUN_LLM_TESTS=1)', () => {
  it('phân loại đúng ≥ 6/7 intent demo', async () => {
    const parser = new DeepSeekParser(env.DEEPSEEK_API_KEY!);
    let ok = 0;
    for (const c of CASES) {
      const r = await parser.parse({ text: c.text, products: SEED.products, glossary: SEED.glossary });
      if (r.intent === c.intent) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(6);
  }, 60_000);
});
