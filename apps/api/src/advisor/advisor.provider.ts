import type { Provider } from '@nestjs/common';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { AdvisorAgent, ClaudeAdvisorAgent, NoopAdvisorAgent } from './advisor-agent.js';
import { DeepSeekAdvisorAgent } from './deepseek-advisor.js';

/**
 * Chon BAN SOAN TU VAN theo `ADVICE_COMPOSER`.
 *
 * Ban soan di theo cong tac RIENG, khong bam theo `PARSER_MODE`. Ly do: pilot chay
 * `PARSER_MODE=flowise` (noi bo). Neu bam theo parser thi hoac ban soan chet hoan toan tren pilot,
 * hoac Claude bi them vao luong du lieu nhu mot he qua PHU cua viec chon parser. Ca hai deu sai:
 * them mot ben nhan du lieu phai la quyet dinh co y cua nguoi van hanh.
 *
 * Thieu cong tac hoac thieu API key -> `NoopAdvisorAgent` -> giu nguyen ban noi FAQ, khong sap.
 * KHONG am tham roi sang nha cung cap khac khi thieu khoa cua nha cung cap DA CHON.
 *
 * VI SAO TACH RA KHOI `content.module.ts` (22/08/2026): khi nam inline trong `@Module`, day chinh
 * la doan quyet dinh `COMPOSER_DISABLED` co chay duoc hay khong — ma khong test nao cham toi duoc.
 * Hau qua: test khang dinh `COMPOSER_DISABLED` bang `advisor: undefined`, mot cau hinh DI KHONG
 * TON TAI, nen no xanh trong khi stack that ghi `LLM_RETURNED_NOTHING`. Tach ra de hop dong
 * "ma nao reachable voi cau hinh nao" kiem duoc bang chinh day noi cua san pham.
 * Cung khuon voi `pipeline/parser.provider.ts`.
 */
export function createAdvisorAgent(): AdvisorAgent {
  const env = loadFoundationEnv();
  if (env.ADVICE_COMPOSER === 'claude' && env.ANTHROPIC_API_KEY) {
    return new ClaudeAdvisorAgent(env.ANTHROPIC_API_KEY, env.ADVICE_MODEL);
  }
  if (env.ADVICE_COMPOSER === 'deepseek' && env.DEEPSEEK_API_KEY) {
    return new DeepSeekAdvisorAgent(env.DEEPSEEK_API_KEY, env.ADVICE_DEEPSEEK_MODEL);
  }
  return new NoopAdvisorAgent();
}

export const advisorProvider: Provider = {
  provide: AdvisorAgent,
  useFactory: createAdvisorAgent,
};
