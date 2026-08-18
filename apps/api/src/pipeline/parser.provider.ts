import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { ClaudeParser } from './claude-parser.js';
import { DeepSeekParser } from './deepseek-parser.js';
import { FlowiseParser } from './flowise-parser.js';
import type { OrderParser } from './order-parser.js';
import { ORDER_PARSER } from './parser.tokens.js';

/** Chon OrderParser theo PARSER_MODE; rieng Flowise da duoc loadEnv kiem tra fail-fast. */
export const parserProvider: Provider = {
  provide: ORDER_PARSER,
  useFactory: (): OrderParser => {
    const env = loadEnv();
    const logger = new Logger('ParserProvider');
    if (env.PARSER_MODE === 'claude' && env.ANTHROPIC_API_KEY) {
      logger.log(`Parser: ClaudeParser (AI that - Anthropic, model=${env.PARSER_MODEL})`);
      return new ClaudeParser(env.ANTHROPIC_API_KEY, env.PARSER_MODEL);
    }
    if (env.PARSER_MODE === 'claude') {
      throw new Error('ANTHROPIC_API_KEY bat buoc khi PARSER_MODE=claude');
    }
    if (env.PARSER_MODE === 'deepseek') {
      // loadEnv da fail-fast neu thieu khoa — khong con duong am tham ve FakeParser.
      logger.log(`Parser: DeepSeekParser (AI that - DeepSeek, model=${env.DEEPSEEK_MODEL})`);
      return new DeepSeekParser(env.DEEPSEEK_API_KEY!, env.DEEPSEEK_MODEL);
    }
    if (env.PARSER_MODE === 'flowise') {
      // loadEnv da fail-fast neu thieu mot trong ba bien Flowise.
      logger.log('Parser: FlowiseParser (Agentflow V2 noi bo)');
      return new FlowiseParser({
        baseUrl: env.FLOWISE_BASE_URL!,
        flowId: env.FLOWISE_FLOW_ID!,
        apiKey: env.FLOWISE_API_KEY!,
        timeoutMs: env.FLOWISE_TIMEOUT_MS,
      });
    }
    // KHONG con nhanh catch-all ve parser gia (18/08/2026). Truoc do day la nhanh bat-tat-ca:
    // thieu khoa hay go nham ten mode deu roi vao MockParser ma khong bao gi.
    throw new Error(`PARSER_MODE=${env.PARSER_MODE} khong duoc ho tro`);
  },
};
