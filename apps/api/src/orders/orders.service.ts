import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  loadEnv,
  type ConversationThreadView,
  type OrderView,
  type OutboundContent,
  type ReplyChannel,
} from '@netviet/shared';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { autoLabel } from '../channels/auto-label.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { canAmendOrder, type AmendVerdict } from './amend-window.js';
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
        view.priced.confirmationText + autoLabel(),
        'bot',
        { quote: view.quoteTarget },
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

  /**
   * Ghi trang thai MACH HOI THOAI vao don da luu (Pha 6).
   *
   * Tach khoi `sendConfirmation`/`sendProductAdvice` co chu y: mach duoc chot SAU khi tin da gui
   * xong, nen no khong duoc phep lam that bai mot lan gui da thanh cong. Loi o day chi log.
   */
  async patchConversation(id: string, conversation: ConversationThreadView): Promise<void> {
    try {
      const updated = await this.repo.update(id, { conversation });
      if (updated) this.events?.emit({ type: 'order.updated', order: updated });
    } catch {
      // Don van dung; chi mat mot nhan trang thai tren console.
    }
  }

  /**
   * Nut "Duyet & gui" cua Sale — DINH TUYEN THEO NOI DUNG dang co.
   *
   * Truoc 21/08/2026 ham nay goi thang `sendConfirmation()`, ma ham do nem 422 "Tin nay khong
   * phai don hang" ngay khi `priced` rong. Console lai hien dung mot nut cho ca `pending_review`
   * lan `needs_edit`, nen MOI tin tu van deu bam vao mot loi — dung nhung tin ma cong handoff
   * tat dinh vua day ve `needs_edit`. Con `sendProductAdvice()` thi khong route nao goi toi.
   *
   * Thu tu xet co y: don da tinh gia di truoc, vi mot don vua co `priced` vua co `outbound` thi
   * ban XAC NHAN moi la chung tu — ban tu van chi la loi dan kem.
   */
  async approve(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    if (view.status === 'sent' || view.status === 'synced') return view;
    if (view.priced) return this.sendConfirmation(id);
    if (view.trace?.outbound) return this.sendProductAdvice(id);
    throw new UnprocessableEntityException(
      'Tin nay chua co ban xac nhan hay ban tu van nao de gui',
    );
  }

  /**
   * HUY mot don — duong duy nhat de LLM (hoac Sale) dong mot don lai.
   *
   * Khac `reject()`: `reject` la Sale tu choi mot don CHUA gui. Ham nay di qua `canAmendOrder()`
   * nen no huy duoc ca don DA GUI, mien Sale chua go vao ERP — dung tinh huong khach bao "huy don
   * cu 20 lay 5 cai thoi" sau khi da nhan xac nhan.
   *
   * Dong luon viec nhap ERP: mot don da huy ma con nam trong hang viec cua Sale la cach chac chan
   * de no duoc go vao KiotViet sau do.
   */
  async cancelOrder(id: string, reason: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    if (view.status === 'rejected') return view;
    const verdict = canAmendOrder(view);
    if (!verdict.allowed) throw new UnprocessableEntityException(verdict.message);

    const cancelled = (await this.repo.update(id, {
      status: 'rejected',
      cancelReason: reason,
      ...(view.salesHandoff
        ? { salesHandoff: { ...view.salesHandoff, status: 'cancelled' as const } }
        : {}),
    }))!;
    this.events?.emit({ type: 'order.updated', order: cancelled });
    return cancelled;
  }

  /** Noi hai don thay the nhau, sau khi don moi da duoc tao. */
  async linkSupersede(oldId: string, newId: string): Promise<void> {
    await this.repo.update(oldId, { supersededByOrderId: newId });
    await this.repo.update(newId, { supersedesOrderId: oldId });
  }

  /** Don con sua duoc khong — de ben goi hoi TRUOC khi hua voi khach. */
  async amendVerdict(id: string): Promise<AmendVerdict> {
    return canAmendOrder(await this.getOrThrow(id));
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
