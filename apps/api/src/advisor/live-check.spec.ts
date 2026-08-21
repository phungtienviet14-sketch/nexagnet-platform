/**
 * EVAL THAT goi Claude — chi chay khi `RUN_LLM_TESTS=1` + co `ANTHROPIC_API_KEY`. Mac dinh SKIP
 * (khong tinh phi API trong CI), cung khuon voi `deepseek-eval.spec.ts`.
 *
 * VI SAO CAN MOT EVAL RIENG cho agent tu van: unit test dung client gia nen no chung minh duoc
 * vong lap cong cu, chan tien va diem cat cache — nhung KHONG chung minh duoc dieu khach thuc su
 * phan anh: "hoi may cau khac nhau ma tra loi y het nhau". Cau do chi tra loi duoc bang cach hoi
 * that bon cau roi so bon cau tra loi.
 *
 * Chay:
 *   RUN_LLM_TESTS=1 pnpm --filter @netviet/api exec vitest run src/advisor/live-check.spec.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ClaudeAdvisorAgent } from './advisor-agent.js';
import { DeepSeekAdvisorAgent } from './deepseek-advisor.js';
import { InMemoryContentRepository } from '../content/content.repository.js';
import { ContentImportService } from '../content/content-import.service.js';
import { ContentService } from '../content/content.service.js';
import { LocalManifestContentSource } from '../content/local-manifest-content.source.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

/**
 * Chon nha cung cap bang `ADVICE_COMPOSER` de eval nay do DUNG cai dang chay tren stack, khong do
 * mot duong khac roi bao cao nham.
 */
const PROVIDER = process.env.ADVICE_COMPOSER ?? 'claude';
const KEY = PROVIDER === 'deepseek' ? (process.env.DEEPSEEK_API_KEY ?? '') : (process.env.ANTHROPIC_API_KEY ?? '');
const shouldRun = process.env.RUN_LLM_TESTS === '1' && Boolean(KEY);
const suite = shouldRun ? describe : describe.skip;

suite(`agent tu van — API that (${PROVIDER})`, () => {
  it('bon cau hoi khac nhau ve V08 -> bon cau tra loi KHAC nhau', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
    const repo = new InMemoryContentRepository(
      {},
      knowledge.products().map((product) => product.sku),
    );
    const content = new ContentService(repo);
    // Duong dan tuong doi tinh tu `apps/api` (cwd cua vitest trong goi nay).
    const manifest = JSON.parse(
      readFileSync('../../tenants/ultty/data/content-manifest.json', 'utf8'),
    );
    await new ContentImportService(repo, new LocalManifestContentSource()).apply(
      manifest,
      true,
      'live-check',
    );
    await content.reload();
    const faqIds = content.snapshot().faqs.map((faq) => faq.id);
    await content.bulkSetStatus('faq', faqIds, 'active');
    await content.reload();
    console.log('FAQ active:', content.snapshot().faqs.filter((f) => f.status === 'active').length);

    const agent =
      PROVIDER === 'deepseek'
        ? new DeepSeekAdvisorAgent(KEY, process.env.ADVICE_DEEPSEEK_MODEL ?? 'deepseek-v4-flash')
        : new ClaudeAdvisorAgent(KEY, process.env.ADVICE_MODEL ?? 'claude-opus-5');
    const questions = [
      'v08 bao nhieu tien',
      'v08 dung nhu nao',
      'v08 hut duoc san go k',
      'bao hanh may thang',
    ];

    const answers: string[] = [];
    for (const question of questions) {
      const reply = await agent.reply({
        customerText: question,
        senderDisplayName: 'Lan',
        tools: {
          knowledge,
          content,
          resolved: { dealer: null, branch: null, groupName: null, senderType: 'dai_ly' },
          senderType: 'dai_ly',
          chatId: 'live-check',
        },
      });
        console.log(
        `\n>>> ${question}\n<<< [${reply?.usedTools.join(',') ?? 'NULL'}] ${reply?.text ?? '(null)'}`,
      );
      answers.push(reply?.text ?? '');
    }

    expect(answers.filter(Boolean)).toHaveLength(4);
    expect(new Set(answers).size).toBe(4);
  }, 240_000);
});
