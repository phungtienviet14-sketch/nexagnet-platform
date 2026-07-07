import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { ClaudeParser } from './claude-parser.js';
import { MockParser } from './mock-parser.js';
import type { OrderParser } from './order-parser.js';
import { ORDER_PARSER } from './parser.tokens.js';

/**
 * Chon parser theo env: PARSER_MODE=claude + co ANTHROPIC_API_KEY -> Claude that;
 * nguoc lai -> MockParser (demo offline).
 */
export const parserProvider: Provider = {
  provide: ORDER_PARSER,
  useFactory: (): OrderParser => {
    const env = loadEnv();
    const logger = new Logger('ParserProvider');
    if (env.PARSER_MODE === 'claude' && env.ANTHROPIC_API_KEY) {
      logger.log('Parser: ClaudeParser (AI that)');
      return new ClaudeParser(env.ANTHROPIC_API_KEY);
    }
    logger.log('Parser: MockParser (tat dinh, demo offline)');
    return new MockParser();
  },
};
