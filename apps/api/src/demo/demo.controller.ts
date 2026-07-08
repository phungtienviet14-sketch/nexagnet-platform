import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  channelMessageSchema,
  loadEnv,
  type DemoConfig,
  type DemoGroup,
  type OrderView,
} from '@ultty/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

/** Nhom test that (map -> Meta HN) — dung lam mac dinh khi demo qua simulate. */
const DEMO_CHAT_ID = 'zgr-f8a7101d77709e2ec761';

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
    private readonly orders: OrdersRepository,
  ) {}

  @Get('samples')
  samples(): string[] {
    return SAMPLE_MESSAGES;
  }

  /** Che do van hanh (bot bat/tat, parser dang dung, stream) — topbar + frontend chon SSE/polling. */
  @Get('config')
  config(): DemoConfig {
    const env = loadEnv();
    return {
      botMode: env.BOT_MODE,
      parserMode: env.PARSER_MODE,
      botName: env.BOT_NAME,
      streamMode: env.STREAM_MODE,
      autoSend: env.AUTO_SEND,
    };
  }

  /** Danh sach nhom da map — web dung lam bo chon nhom khi giả lập tin. */
  @Get('groups')
  groups(): DemoGroup[] {
    // Dung chung logic map nhom->dai ly voi KnowledgeController (DRY).
    return this.knowledge.groupViews().map((g) => ({
      chatId: g.chatId,
      name: g.groupName,
      dealerName: g.dealerName,
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

  /**
   * "Chay lai" 1 tin da co: gọi LẠI LLM thật với cùng text/nhom, GIU nguyen id
   * (cap nhat DUNG don, khong tao don moi) + phat lai su kien stream.
   */
  @Post('rerun/:id')
  rerun(@Param('id') id: string): Promise<OrderView> {
    const existing = this.orders.findById(id);
    if (!existing) {
      throw new NotFoundException(`Khong tim thay tin ${id} de chay lai`);
    }
    // Don da dong bo KiotViet -> KHONG chay lai (giu idempotent M4: tranh ghi de mat
    // kiotVietCode roi duyet lai gay day don trung).
    if (existing.status === 'synced') {
      throw new BadRequestException('Đơn đã đồng bộ KiotViet — không thể chạy lại');
    }
    const message = channelMessageSchema.parse({
      externalMessageId: `rerun-${id}-${Date.now()}`,
      platform: 'zalo',
      source: 'copilot_paste',
      chatType: 'group',
      externalChatId: existing.chatId,
      text: existing.rawText,
      imageUrl: existing.imageUrl,
      sentAt: new Date(),
    });
    return this.pipeline.process(message, loadEnv().BOT_NAME, { orderId: id, rerun: true });
  }
}
