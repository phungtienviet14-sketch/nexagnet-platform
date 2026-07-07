import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { OrderView } from '@ultty/shared';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { KiotVietAdapter } from '../kiotviet/kiotviet.adapter.js';
import { OrdersRepository } from './orders.repository.js';

/** Nhan tin tu dong theo dieu khoan Zalo Bot Platform (bao cao muc 6.3). */
const AUTO_LABEL = '\n— Tin tự động từ Bot Ultty';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly channel: ChannelAdapter,
    private readonly kiotViet: KiotVietAdapter,
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
   * Trang thai cuoi: synced (hoan tat).
   */
  async approve(id: string): Promise<OrderView> {
    const view = this.getOrThrow(id);
    if (!view.priced) {
      throw new UnprocessableEntityException('Tin nay khong phai don hang, khong the duyet');
    }
    this.repo.update(id, { status: 'approved' });
    await this.channel.sendMessage(view.chatId, view.priced.confirmationText + AUTO_LABEL);
    const { code } = await this.kiotViet.pushOrder(view.priced);
    return this.repo.update(id, { status: 'synced', kiotVietCode: code })!;
  }

  reject(id: string): OrderView {
    this.getOrThrow(id);
    return this.repo.update(id, { status: 'rejected' })!;
  }
}
