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
} from '@netviet/shared';
import { loadDemoMessages } from '@netviet/tenant';
import { Optional } from '@nestjs/common';
import { resolveBotName } from '../channels/bot-name.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { TurnRecordsRepository } from '../turns/turn-records.repository.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { Roles } from '../auth/roles.decorator.js';

/**
 * Tin mau cho luong demo. Truoc Dot B1 bon cau nay nam thang o day — chung chua SKU + ten bot cua
 * MOT khach ("ghe felix", "quat elni"), tuc nhan dung chung mang san du lieu thuong mai cua khach.
 * Nay doc tu goi khach `tenants/<slug>/data/demo-messages.json`; goi khong co file -> mang rong.
 */
const SAMPLE_MESSAGES = loadDemoMessages();

interface SimulateBody {
  text?: string;
  chatId?: string;
  imageUrl?: string;
}

/**
 * Cong demo: bom 1 tin GIA vao dung pipeline (khong can Zalo) — luoi an toan
 * khi trinh demo neu mang/Zalo truc trac.
 *
 * THUOC `turn-processing`, khong phai `sales-order` (24/08/2026). Trong ca tep khong co mot dong
 * nao ve don, gia, dai ly hay ERP: no bom mot tin gia vao pipeline roi tra ve BAN GHI LUOT. Va
 * `/demo/simulate` la cong DUY NHAT chay tron pipeline that ma khong can Zalo — smoke test luc
 * deploy, bo do tre cua observability va bo eval parser deu di qua no. De no duoi `sales-order`
 * nghia la mot khach trung tinh khong co cach nao chay thu mot luot sau khi len, dung luc can nhat.
 */
@Roles('SALE', 'MANAGER', 'ADMIN')
@Controller('demo')
export class DemoController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly knowledge: KnowledgeService,
    /** Kho LUOT (`OrdersRepository` la cung instance, doc bang ngon ngu don hang). */
    private readonly turnRecords: TurnRecordsRepository,
    /**
     * `operations` la mot capability RIENG — mot khach co hoi thoai khong bat buoc phai co console
     * van hanh. Vang mat thi doc thang kill switch tu moi truong, cung khuon `PipelineService`.
     */
    @Optional() private readonly settings?: RuntimeSettingsService,
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
      channelMode: env.CHANNEL_MODE,
      parserMode: env.PARSER_MODE,
      botName: resolveBotName(),
      streamMode: env.STREAM_MODE,
      autoSend: this.settings?.autoSend() ?? env.AUTO_SEND,
      zaloOperatorUrl: env.ZALO_OPERATOR_ORIGIN
        ? `${env.ZALO_OPERATOR_ORIGIN.replace(/\/$/, '')}/zalo`
        : undefined,
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
      // Luon lay nhom dang map trong nguon su that de khong gui vao group ID demo cu.
      externalChatId: body.chatId ?? this.knowledge.groups()[0]?.chatId ?? 'demo-unmapped',
      text: body.text,
      imageUrl: body.imageUrl,
      sentAt: new Date(),
    });
    return this.pipeline.process(message, resolveBotName());
  }

  /**
   * "Chay lai" 1 tin da co: gọi LẠI LLM thật với cùng text/nhom, GIU nguyen id
   * (cap nhat DUNG don, khong tao don moi) + phat lai su kien stream.
   */
  @Post('rerun/:id')
  async rerun(@Param('id') id: string): Promise<OrderView> {
    const existing = await this.turnRecords.findById(id);
    if (!existing) {
      throw new NotFoundException(`Khong tim thay tin ${id} de chay lai`);
    }
    // Don da gui khach la trang thai cuoi cua luong xac nhan: khong ghi de hay gui trung.
    // `synced` duoc giu de bao ve du lieu legacy tu truoc GĐ1 send-only.
    if (existing.status === 'sent' || existing.status === 'synced') {
      throw new BadRequestException('Đơn đã gửi khách — không thể chạy lại');
    }
    const message = channelMessageSchema.parse({
      externalMessageId: `rerun-${id}-${Date.now()}`,
      platform: 'zalo',
      source:
        existing.replyChannel === 'bot'
          ? 'bot_webhook'
          : existing.replyChannel === 'zca'
            ? 'zca_listener'
            : 'copilot_paste',
      chatType: 'group',
      externalChatId: existing.chatId,
      text: existing.rawText,
      imageUrl: existing.imageUrl,
      sentAt: new Date(),
    });
    return this.pipeline.process(message, resolveBotName(), { orderId: id, rerun: true });
  }
}
