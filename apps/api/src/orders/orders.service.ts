import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { loadEnv, type OrderView, type OutboundContent, type ReplyChannel } from '@netviet/shared';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  private readonly confirmationsInFlight = new Map<string, Promise<OrderView>>();
  private readonly contentRepliesInFlight = new Map<string, Promise<OrderView>>();

  constructor(
    private readonly repo: OrdersRepository,
    private readonly outbound: OutboundChannelRouter,
    @Optional() private readonly events?: AgentEventsService,
  ) {}

  /** Danh sach DON (intent dat_don). */
  async listOrders(): Promise<OrderView[]> {
    return (await this.repo.list()).filter((v) => v.intent === 'dat_don');
  }

  /** Feed moi tin da xu ly (raw) cho tab Tin nhan. */
  async listMessages(): Promise<OrderView[]> {
    return this.repo.list();
  }

  async getOrThrow(id: string): Promise<OrderView> {
    const view = await this.repo.findById(id);
    if (!view) throw new NotFoundException(`Khong tim thay don ${id}`);
    return view;
  }

  /**
   * Gui xac nhan cho khach, sau do ghi `sent` + handoff Sale trong cung mot repository update.
   * GĐ1 dung tai day: KHONG goi ERP. Neu outbound loi, don va handoff giu nguyen de gui lai.
   */
  async sendConfirmation(id: string): Promise<OrderView> {
    const inFlight = this.confirmationsInFlight.get(id);
    if (inFlight) return inFlight;

    const confirmation = this.performSendConfirmation(id).finally(() => {
      if (this.confirmationsInFlight.get(id) === confirmation) {
        this.confirmationsInFlight.delete(id);
      }
    });
    this.confirmationsInFlight.set(id, confirmation);
    return confirmation;
  }

  /**
   * Gui tu van san pham chi tu payload active/approved da duoc AgentOrchestrator dong goi.
   * Adapter khong ho tro anh thi ha cap ve text + link; khong gia lap sendVideo/sendFile.
   */
  async sendProductAdvice(id: string): Promise<OrderView> {
    const inFlight = this.contentRepliesInFlight.get(id);
    if (inFlight) return inFlight;
    const sending = this.performSendProductAdvice(id).finally(() => {
      if (this.contentRepliesInFlight.get(id) === sending) this.contentRepliesInFlight.delete(id);
    });
    this.contentRepliesInFlight.set(id, sending);
    return sending;
  }

  private async performSendProductAdvice(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    if (view.status === 'sent') return view;
    const content = view.trace?.outbound;
    if (view.intent !== 'hoi_san_pham' || view.status !== 'pending_review' || !content) {
      throw new UnprocessableEntityException('Tư vấn chưa đủ nội dung đã duyệt để gửi');
    }
    const replyChannel = view.replyChannel ?? legacyReplyChannel();
    if (!replyChannel) {
      throw new UnprocessableEntityException('Thiếu kênh phản hồi, không thể gửi tư vấn');
    }
    const capabilities = this.outbound.capabilities(replyChannel);
    const { image, ...withoutImage } = content;
    const supported: OutboundContent = capabilities.image
      ? { ...content, text: content.text + AUTO_LABEL }
      : {
          ...withoutImage,
          // Kênh không có API ảnh thật (hiện tại là zca) vẫn phải giữ locator cho khách,
          // không được âm thầm làm mất asset. Video/PDF/catalog cũng theo cùng nguyên tắc URL.
          text: [content.text, image ? `Ảnh sản phẩm: ${image.url}` : null]
            .filter((line): line is string => Boolean(line))
            .join('\n') + AUTO_LABEL,
        };
    try {
      await this.outbound.sendContent(replyChannel, view.chatId, supported);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Gửi tư vấn sản phẩm thất bại — giữ nguyên để thử lại. (${detail})`,
      );
    }
    const sent = (await this.repo.update(id, { status: 'sent' }))!;
    this.events?.emit({ type: 'order.updated', order: sent });
    return sent;
  }

  private async performSendConfirmation(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    // Ho tro ca du lieu legacy `synced`: khong gui lai mot don khach da nhan.
    if (view.status === 'sent' || view.status === 'synced') {
      return view;
    }
    if (!['pending_review', 'needs_edit', 'approved'].includes(view.status)) {
      throw new UnprocessableEntityException(
        `Đơn ở trạng thái ${view.status}, không thể gửi xác nhận`,
      );
    }
    if (!view.priced) {
      throw new UnprocessableEntityException('Tin nay khong phai don hang, khong the duyet');
    }

    try {
      await this.outbound.sendMessage(
        view.replyChannel ?? legacyReplyChannel(),
        view.chatId,
        view.priced.confirmationText + AUTO_LABEL,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Gửi xác nhận vào nhóm Zalo thất bại — đơn giữ nguyên, thử gửi lại. (${detail})`,
      );
    }

    const sent = (await this.repo.update(id, {
      status: 'sent',
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    }))!;
    this.events?.emit({ type: 'order.updated', order: sent });
    return sent;
  }

  /** Sale dong tac vu nhap ERP thu cong; thao tac lap lai khong tao them handoff. */
  async completeSalesHandoff(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    if (view.status !== 'sent' || !view.salesHandoff) {
      throw new UnprocessableEntityException('Đơn chưa có việc nhập ERP thủ công để hoàn tất');
    }
    if (view.salesHandoff.status === 'completed') return view;

    const completed = (await this.repo.update(id, {
      salesHandoff: { ...view.salesHandoff, status: 'completed' },
    }))!;
    this.events?.emit({ type: 'order.updated', order: completed });
    return completed;
  }

  /** Nut Sale xac nhan ngoai le dung cung luong send-only cua GĐ1. */
  async approve(id: string): Promise<OrderView> {
    return this.sendConfirmation(id);
  }

  async reject(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    if (view.status === 'rejected') return view;
    if (!['draft', 'pending_review', 'needs_edit', 'approved'].includes(view.status)) {
      throw new UnprocessableEntityException(`Đơn ở trạng thái ${view.status}, không thể từ chối`);
    }
    const rejected = (await this.repo.update(id, { status: 'rejected' }))!;
    this.events?.emit({ type: 'order.updated', order: rejected });
    return rejected;
  }
}

/** Don cu chua co replyChannel chi duoc suy ra khi runtime KHONG phai hybrid. */
function legacyReplyChannel(): ReplyChannel | undefined {
  const mode = loadEnv().CHANNEL_MODE;
  return mode === 'hybrid' ? undefined : mode;
}
