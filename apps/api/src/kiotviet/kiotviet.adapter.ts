import { Injectable, Logger } from '@nestjs/common';
import type { PricedOrder } from '@ultty/shared';

/**
 * Tang 5 — tich hop KiotViet. KiotViet CHUA co API (khao sat) nen GD1 dung MOCK:
 * gia lap tao don + tra ve ma don. GD2 thay bang KiotVietApiAdapter (goi API that
 * hoac xuat Excel import) ma khong dung service goi no.
 */
export abstract class KiotVietAdapter {
  abstract pushOrder(order: PricedOrder): Promise<{ code: string }>;
}

@Injectable()
export class KiotVietMockAdapter extends KiotVietAdapter {
  readonly name = 'mock';
  private readonly logger = new Logger('KiotVietMock');
  private counter = 1000;

  async pushOrder(order: PricedOrder): Promise<{ code: string }> {
    // Gia lap do tre goi API
    await new Promise((resolve) => setTimeout(resolve, 250));
    this.counter += 1;
    const code = `KV-${this.counter}`;
    this.logger.log(`[MOCK KiotViet] tao don ${code}: ${order.dealerName} · ${order.grandTotal}d`);
    return { code };
  }
}
