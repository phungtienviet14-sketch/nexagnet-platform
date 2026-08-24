import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { tenantOrderAutomation } from '@netviet/tenant';
import { TelemetryService } from '../observability/telemetry.service.js';
import {
  TurnOutcomePort,
  type TurnOutcome,
  type TurnOutcomeContext,
} from '../turns/turn-outcome.port.js';
import { evaluateAutoConfirm } from './order-auto-confirmation.js';
import { OrdersService } from './orders.service.js';
import { SALES_ORDER_DECISIONS } from './sales-order-decisions.js';

/**
 * BAN HANG NHAN LAY MOT LUOT — cong tu xac nhan don GĐ1, nay nam trong mien so huu no.
 *
 * Truoc 24/08/2026 toan bo khoi nay nam trong `PipelineService.runPipelineTurn()`. Hau qua do
 * duoc: turn-processing phai import `SALES_ORDER_DECISIONS`, phai goi `tenantOrderAutomation()`
 * cho MOI luot cua MOI khach, va phai giu mot tham chieu toi `OrdersService`. Mot khach khong
 * ban gi van di qua dung cai cong hoi "don nay co duoc tu gui khong".
 *
 * KHONG MOT LUAT NGHIEP VU NAO DOI o lan chuyen nay: thu tu kiem tra, nguong tenant, kill switch,
 * ma ly do, ten buoc trace va ten diem quyet dinh giu nguyen tung chu. Cai doi la AI HOI CAU HOI.
 */
@Injectable()
export class SalesOrderOutcomeService extends TurnOutcomePort {
  private readonly logger = new Logger('SalesOrderOutcome');

  constructor(
    private readonly orders: OrdersService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {
    super();
  }

  async settle(view: OrderView, context: TurnOutcomeContext): Promise<TurnOutcome> {
    const decision = evaluateAutoConfirm(view, {
      policy: tenantOrderAutomation(),
      killSwitchEnabled: context.killSwitchEnabled,
      manualReview: context.manualReview,
    });
    this.telemetry?.decision({
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.auto_confirm',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      ...(decision.detail ? { detail: decision.detail } : {}),
    });
    // Cong dong -> ban hang KHONG nhan luot nay. Luot di tiep sang duong tra loi tu van chung,
    // y het nhu o mot khach khong bat `sales-order`.
    if (!decision.allowed) return { claimed: false };

    try {
      this.logger.log(`[AUTO_SEND] Tu xac nhan ${view.id} theo policy tenant`);
      const sent = await this.observed('outbound.send_confirmation', () =>
        this.orders.sendConfirmation(view.id),
      );
      this.telemetry?.stateChange({
        entity: 'Order',
        entityId: view.id,
        from: view.status,
        to: sent.status,
        reason: 'ALLOWED',
      });
      return { claimed: true, view: sent, closed: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[AUTO_SEND] that bai cho ${view.id} — giu Sale duyet: ${detail}`);
      // `degraded`, khong phai `denied`: cong da MO, viec that bai o duong gui. Hai thu nay
      // doi hoi hai hanh dong sua khac han nhau, nen chung khong duoc mang cung mot nhan.
      this.telemetry?.decision({
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.auto_confirm',
        outcome: 'degraded',
        reason: 'ALLOWED',
        detail: { sendFailed: 1 },
      });
      // VAN `claimed`: ban hang da quyet dinh xong ve luot nay. `closed: false` de mach hoi thoai
      // khong ghi nhan mot lan gui hong nhu mot lan chot.
      return { claimed: true, view, closed: false };
    }
  }

  private observed<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.telemetry ? this.telemetry.step(name, fn) : fn();
  }
}
