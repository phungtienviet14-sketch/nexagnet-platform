import {
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OrderView, OutboundContent } from '@netviet/shared';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { autoLabel } from '../channels/auto-label.js';
import { legacyReplyChannel } from '../channels/legacy-reply-channel.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { TurnRecordsRepository } from './turn-records.repository.js';

/**
 * DUONG TRA LOI TRUNG TINH — gui ra kenh cai ma agent da soan cho mot luot.
 *
 * Tach khoi `OrdersService` ngay 24/08/2026. Doan code nay CHUA BAO GIO la nghiep vu ban hang:
 * no tu choi thang `intent === 'dat_don'` (don co ban xac nhan rieng) va phuc vu MOI y dinh tu
 * van — bao hanh, cong no, van chuyen. No nam trong `OrdersService` chi vi lich su, va hau qua la
 * mot khach khong ban hang thi AI doc duoc tin nhung khong tra loi duoc.
 */
@Injectable()
export class TurnReplyService {
  private readonly inFlight = new Map<string, Promise<OrderView>>();

  constructor(
    private readonly repo: TurnRecordsRepository,
    private readonly outbound: OutboundChannelRouter,
    @Optional() private readonly events?: AgentEventsService,
  ) {}

  /**
   * Gui ban tu van agent da dong goi. Chong bam/goi hai lan bang mot promise dang bay tren id —
   * giu nguyen hanh vi cu cua `OrdersService.sendProductAdvice()`.
   */
  async sendAdviceReply(id: string): Promise<OrderView> {
    const inFlight = this.inFlight.get(id);
    if (inFlight) return inFlight;
    const sending = this.performSendAdviceReply(id).finally(() => {
      if (this.inFlight.get(id) === sending) this.inFlight.delete(id);
    });
    this.inFlight.set(id, sending);
    return sending;
  }

  private async performSendAdviceReply(id: string): Promise<OrderView> {
    const view = await this.repo.findById(id);
    if (!view) throw new UnprocessableEntityException(`Khong tim thay luot ${id}`);
    if (view.status === 'sent') return view;
    const content = view.trace?.outbound;
    // MOI intent tu van deu gui duoc, khong rieng `hoi_san_pham`: cau hoi bao hanh/cong no/van
    // chuyen cung do agent soan tu tai lieu da duyet va cung phai den duoc khach.
    // `needs_edit` duoc phep vi day la duong Sale BAM DUYET sau khi doc — khac auto-send.
    if (view.intent === 'dat_don' || !content) {
      throw new UnprocessableEntityException('Tin nay khong co noi dung tu van de gui');
    }
    if (view.status !== 'pending_review' && view.status !== 'needs_edit') {
      throw new UnprocessableEntityException(
        `Đơn ở trạng thái ${view.status}, không thể gửi tư vấn`,
      );
    }
    const replyChannel = view.replyChannel ?? legacyReplyChannel();
    if (!replyChannel) {
      throw new UnprocessableEntityException('Thiếu kênh phản hồi, không thể gửi tư vấn');
    }
    const capabilities = this.outbound.capabilities(replyChannel);
    const { images, ...withoutImages } = content;
    const supported: OutboundContent = capabilities.image
      ? { ...content, text: content.text + autoLabel() }
      : {
          ...withoutImages,
          // Kênh không có API ảnh thật vẫn phải giữ locator cho khách, không được âm thầm làm mất
          // asset. Video/PDF/catalog cũng theo cùng nguyên tắc URL.
          text:
            [content.text, ...(images ?? []).map((image) => `Ảnh sản phẩm: ${image.url}`)].join(
              '\n',
            ) + autoLabel(),
        };
    try {
      await this.outbound.sendContent(replyChannel, view.chatId, supported, 'bot', {
        quote: view.quoteTarget,
      });
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
}
