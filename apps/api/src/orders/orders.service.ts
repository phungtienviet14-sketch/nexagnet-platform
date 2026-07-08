import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OrderView } from '@ultty/shared';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { KiotVietAdapter } from '../kiotviet/kiotviet.adapter.js';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly channel: ChannelAdapter,
    private readonly kiotViet: KiotVietAdapter,
    @Optional() private readonly events?: AgentEventsService,
  ) {}

  /** Danh sach DON (intent dat_don). */
  listOrders(): OrderView[] {
    return this.repo.list().filter((v) => v.intent === 'dat_don');
  }

  /** Feed moi tin da xu ly (raw) cho tab Tin nhan. */
  listMessages(): OrderView[] {
    return this.repo.list();
  }

  getOrThrow(id: string): OrderView {
    const view = this.repo.findById(id);
    if (!view) throw new NotFoundException(`Khong tim thay don ${id}`);
    return view;
  }

  /**
   * Sale duyet 1 cham -> (1) gui format xac nhan vao nhom Zalo, (2) day don len KiotViet.
   * KHONG doi trang thai truoc khi gui thanh cong: neu gui Zalo loi (rate limit/mang),
   * don GIU NGUYEN pending_review/needs_edit de Sale DUYET LAI (khong bi ket). Trang thai
   * chi chuyen 'synced' khi ca 2 buoc xong.
   */
  async approve(id: string): Promise<OrderView> {
    const view = this.getOrThrow(id);
    // Idempotent (M4): don da 'synced' -> khong gui Zalo / day KiotViet lai lan nua.
    if (view.status === 'synced') {
      return view;
    }
    if (!view.priced) {
      throw new UnprocessableEntityException('Tin nay khong phai don hang, khong the duyet');
    }

    try {
      await this.channel.sendMessage(view.chatId, view.priced.confirmationText + AUTO_LABEL);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Gửi xác nhận vào nhóm Zalo thất bại — đơn giữ nguyên, bấm Duyệt lại. (${detail})`,
      );
    }

    const { code } = await this.kiotViet.pushOrder(view.priced);
    const synced = this.repo.update(id, { status: 'synced', kiotVietCode: code })!;
    this.events?.emit({ type: 'order.updated', order: synced });
    return synced;
  }

  reject(id: string): OrderView {
    this.getOrThrow(id);
    const rejected = this.repo.update(id, { status: 'rejected' })!;
    this.events?.emit({ type: 'order.updated', order: rejected });
    return rejected;
  }
}
