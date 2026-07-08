import { Injectable, Logger, Optional } from '@nestjs/common';
import { loadEnv, type ChannelMessage, type OrderView } from '@ultty/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { OrdersService } from '../orders/orders.service.js';

/**
 * Tang 3+4 — adapter mong uy quyen cho AgentOrchestrator (multi-agent 6 con).
 * Giu chu ky process(message, botName) de DemoController/BotPoller khong doi.
 *
 * AUTO_SEND (GD2): neu bat, AI TU CHOT don + gui xac nhan vao nhom (khong can Sale) —
 * CHI khi Giam sat khong phat hien rui ro; co van de -> giu Sale duyet. Mac dinh off.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger('PipelineService');
  private readonly autoSend = loadEnv().AUTO_SEND;

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    @Optional() private readonly orders?: OrdersService,
  ) {}

  async process(
    message: ChannelMessage,
    botName?: string,
    opts?: { orderId?: string; rerun?: boolean },
  ): Promise<OrderView> {
    const view = await this.orchestrator.run(message, botName, opts);

    if (this.shouldAutoSend(view) && this.orders) {
      try {
        this.logger.log(`[AUTO_SEND] AI tu chot ${view.id} (Giam sat: khong rui ro)`);
        // approve = gui xac nhan Zalo + day KiotViet + phat order.updated. Loi gui (H1) ->
        // giu pending_review de Sale duyet lai (khong ket, khong mat don).
        return await this.orders.approve(view.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] that bai cho ${view.id} — giu Sale duyet: ${detail}`);
        return view;
      }
    }
    return view;
  }

  /**
   * Auto-send chi khi: bat AUTO_SEND, la DON da dinh gia, va Giam sat (rule engine tat dinh)
   * bao KHONG rui ro. watch/escalate deu coi la "co van de" -> giu Sale duyet.
   */
  private shouldAutoSend(view: OrderView): boolean {
    return (
      this.autoSend === 'on' &&
      view.intent === 'dat_don' &&
      view.priced !== null &&
      view.trace?.supervisor.riskLevel === 'none'
    );
  }
}
