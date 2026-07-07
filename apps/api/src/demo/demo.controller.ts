import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { channelMessageSchema, loadEnv, type OrderView } from '@ultty/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

/** Nhom test that (map -> Meta HN) — dung lam mac dinh khi demo qua simulate. */
const DEMO_CHAT_ID = 'zgr-f8a7101d77709e2ec761';

/** 1 dong trong bo chon nhom khi demo (web goi GET /demo/groups). */
export interface DemoGroup {
  chatId: string;
  name: string;
  dealerName: string | null;
  branch: string;
}

const SAMPLE_MESSAGES = [
  '@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT',
  '@Bot ultty AI orders 3 noi chien va 2 robot hut bui',
  '@Bot ultty AI orders 5 may loc nuoc, xuat VAT',
  'ghe felix bao nhieu tien c oi',
];

interface SimulateBody {
  text?: string;
  chatId?: string;
  imageUrl?: string;
}

/**
 * Cong demo: bom 1 tin GIA vao dung pipeline (khong can Zalo) — luoi an toan
 * khi trinh demo neu mang/Zalo truc trac.
 */
@Controller('demo')
export class DemoController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get('samples')
  samples(): string[] {
    return SAMPLE_MESSAGES;
  }

  /** Danh sach nhom da map — web dung lam bo chon nhom khi giả lập tin. */
  @Get('groups')
  groups(): DemoGroup[] {
    return this.knowledge.groups().map((g) => ({
      chatId: g.chatId,
      name: g.name,
      dealerName: this.knowledge.findDealerById(g.dealerId)?.name ?? null,
      branch: g.branch,
    }));
  }

  @Post('simulate')
  simulate(@Body() body: SimulateBody): Promise<OrderView> {
    if (!body?.text || body.text.trim().length === 0) {
      throw new BadRequestException('Thieu noi dung tin (text)');
    }
    const message = channelMessageSchema.parse({
      externalMessageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform: 'zalo',
      source: 'copilot_paste',
      chatType: 'group',
      externalChatId: body.chatId ?? DEMO_CHAT_ID,
      text: body.text,
      imageUrl: body.imageUrl,
      sentAt: new Date(),
    });
    return this.pipeline.process(message, loadEnv().BOT_NAME);
  }
}
