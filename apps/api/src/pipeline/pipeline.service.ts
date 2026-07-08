import { Injectable } from '@nestjs/common';
import type { ChannelMessage, OrderView } from '@ultty/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';

/**
 * Tang 3+4 — adapter mong uy quyen cho AgentOrchestrator (multi-agent 6 con).
 * Giu chu ky process(message, botName) de DemoController/BotPoller khong doi.
 */
@Injectable()
export class PipelineService {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  process(message: ChannelMessage, botName?: string): Promise<OrderView> {
    return this.orchestrator.run(message, botName);
  }
}
