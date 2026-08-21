import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderView, ParsedOrderItem } from '@netviet/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { priceOrder, routeStatus } from '../rules/rules.js';
import { canAmendOrder } from './amend-window.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * SUA DON = HUY DON CU + TAO DON THAY THE.
 *
 * Vi sao khong sua tai cho: con so ma khach DA TUNG nhan xac nhan la mot ban ghi, khong phai mot
 * bien. Ke toan doi soat theo no, va khi tich hop ERP that o giai doan sau, mot don bi sua ngam
 * se lam hai he thong noi hai con so khac nhau ma khong ben nao biet. Hai don noi voi nhau bang
 * `supersedesOrderId`/`supersededByOrderId` thi lich su van doc duoc.
 *
 * Bat bien giu nguyen (CLAUDE.md #5): don moi duoc `priceOrder()` tinh lai TU DAU tu nguon su
 * that. LLM chi noi duoc "5 cai ghe Felix"; moi con so tien van do rules engine ra.
 */
@Injectable()
export class OrderAmendmentService {
  private readonly logger = new Logger('OrderAmendment');

  constructor(
    private readonly repo: OrdersRepository,
    private readonly orders: OrdersService,
    private readonly knowledge: KnowledgeService,
  ) {}

  /**
   * Thay don `originalId` bang mot don co dong hang moi.
   *
   * Tra ve don MOI. Don cu chuyen `rejected` va viec nhap ERP cua no bi dong — de Sale khong go
   * ca hai vao KiotViet.
   */
  async replaceItems(
    originalId: string,
    items: readonly ParsedOrderItem[],
    reason: string,
  ): Promise<{ readonly cancelled: OrderView; readonly replacement: OrderView }> {
    const original = await this.orders.getOrThrow(originalId);
    const verdict = canAmendOrder(original);
    if (!verdict.allowed) throw new UnprocessableEntityException(verdict.message);
    if (items.length === 0) {
      throw new UnprocessableEntityException('Đơn thay thế phải có ít nhất một dòng hàng');
    }

    const resolved = this.knowledge.resolveByChatId(original.chatId);
    const priced = priceOrder(
      {
        orderType: original.parsed?.orderType ?? original.priced?.orderType ?? 'TH1',
        items: [...items],
        noVat: original.parsed?.noVat ?? false,
        ...(original.priced?.customerName ? { customerName: original.priced.customerName } : {}),
        ...(original.priced?.customerPhone ? { customerPhone: original.priced.customerPhone } : {}),
        ...(original.priced?.customerAddress
          ? { customerAddress: original.priced.customerAddress }
          : {}),
      },
      {
        dealer: resolved.dealer,
        branch: resolved.branch,
        products: this.knowledge.products(),
        prices: this.knowledge.prices(),
        priceOverrides: this.knowledge.priceOverrides(),
        cfg: DEFAULT_RULES_CONFIG,
      },
    );

    const replacement: OrderView = {
      ...original,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: routeStatus(priced),
      priced,
      parsed: {
        orderType: priced.orderType,
        items: [...items],
        noVat: original.parsed?.noVat ?? false,
      },
      supersedesOrderId: original.id,
      // Don moi bat dau lai tu dau: chua gui, chua co viec ERP, chua mang ket qua cua don cu.
      salesHandoff: undefined,
      supersededByOrderId: undefined,
      cancelReason: undefined,
      rawText: `[sửa đơn ${original.id}] ${reason}`,
    };

    const created = await this.repo.create(replacement);
    const cancelled = await this.orders.cancelOrder(original.id, reason);
    await this.orders.linkSupersede(original.id, created.id);
    this.logger.log(
      `Sua don ${original.id} -> ${created.id} (${items.length} dong, ly do: ${reason})`,
    );
    // Doc lai de kem lien ket supersede vua ghi.
    return {
      cancelled: (await this.repo.findById(original.id)) ?? cancelled,
      replacement: (await this.repo.findById(created.id)) ?? created,
    };
  }
}
