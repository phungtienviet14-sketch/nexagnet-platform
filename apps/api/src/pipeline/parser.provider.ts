import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { ClaudeParser } from './claude-parser.js';
import { DeepSeekParser } from './deepseek-parser.js';
import { FlowiseParser } from './flowise-parser.js';
import { MockParser } from './mock-parser.js';
import type { OrderParser } from './order-parser.js';
import { ORDER_PARSER } from './parser.tokens.js';

/** Chon OrderParser theo PARSER_MODE; rieng Flowise da duoc loadEnv kiem tra fail-fast. */
export const parserProvider: Provider = {
  provide: ORDER_PARSER,
  useFactory: (): OrderParser => {
    const env = loadEnv();
    const logger = new Logger('ParserProvider');
    if (env.PARSER_MODE === 'claude' && env.ANTHROPIC_API_KEY) {
      logger.log('Parser: ClaudeParser (AI that - Anthropic)');
      return new ClaudeParser(env.ANTHROPIC_API_KEY);
    }
    if (env.PARSER_MODE === 'deepseek' && env.DEEPSEEK_API_KEY) {
      logger.log('Parser: DeepSeekParser (AI that - DeepSeek)');
      return new DeepSeekParser(env.DEEPSEEK_API_KEY);
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
    logger.log('Parser: MockParser (tat dinh, demo offline)');
    return new MockParser();
  },
};
