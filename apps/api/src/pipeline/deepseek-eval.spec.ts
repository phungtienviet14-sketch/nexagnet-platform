import { describe, expect, it } from 'vitest';
import { loadEnv } from '@netviet/shared';
import { loadTenantConfig } from '@netviet/tenant';
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

const SMOKE = loadTenantConfig().smoke;
const parse = (parser: DeepSeekParser, text: string) =>
  parser.parse({ text, products: SEED.products, glossary: SEED.glossary });

suite('DeepSeekParser — eval AI thật (RUN_LLM_TESTS=1)', () => {
  it('phân loại đúng ≥ 6/7 intent demo', async () => {
    const parser = new DeepSeekParser(env.DEEPSEEK_API_KEY!);
    let ok = 0;
    for (const c of CASES) {
      const r = await parse(parser, c.text);
      if (r.intent === c.intent) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(6);
  }, 60_000);

  /*
   * REGRESSION 02/09/2026 — deploy ultty/gd1-test #33625765042.
   *
   * Tin mau `smoke` cua goi khach la mot don viet dang BANG KE, dang ma dai ly go nhieu nhat va
   * dang KHONG he co trong bo few-shot (moi vi du `dat_don` deu la cau menh lenh co dong tu).
   * Cau do nam ngay ranh gioi quyet dinh cua model, va deploy do vi the.
   *
   * Lay tu GOI KHACH chu khong cam cung o day: moi khach mot cau don hop le khac nhau
   * (CLAUDE.md muc 6). Goi khach khong khai `smoke` -> khong co gi de kiem.
   *
   * Chay NHIEU lan chu khong mot lan: mot lan dung khong phan biet duoc "on dinh" voi "may".
   */
  it.runIf(SMOKE)('tin mau smoke cua goi khach ra dat_don ON DINH qua 5 lan lien tiep', async () => {
    const parser = new DeepSeekParser(env.DEEPSEEK_API_KEY!);
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => parse(parser, SMOKE!.orderText)),
    );
    for (const r of runs) {
      expect(r.intent).toBe('dat_don');
      expect(r.order?.items?.[0]?.quantity).toBe(SMOKE!.expectedQuantity);
    }
  }, 90_000);

  /**
   * DOI CHUNG AM. Quy tac "bang ke van la don" khong duoc bien thanh "cu co so la don": tin thuc
   * su mo ho van phai ve `khac`. Khong co bai nay thi ban sua chong flake se de dang tro thanh mot
   * ban sua sinh ra don ma khach chua he dat.
   */
  it('tin mo ho / xa giao KHONG bi day thanh dat_don', async () => {
    const parser = new DeepSeekParser(env.DEEPSEEK_API_KEY!);
    for (const text of ['a oi', 'ok c cam on e nhe', 'chao shop', 'c oi cho e hoi chut']) {
      const r = await parse(parser, text);
      expect(r.intent, `"${text}" khong duoc thanh dat_don`).not.toBe('dat_don');
    }
  }, 60_000);
});
