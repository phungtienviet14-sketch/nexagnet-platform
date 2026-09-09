import { Injectable } from '@nestjs/common';
import { MovementRepository } from '../movement/movement.repository.js';
import type { RunLegKind, VehicleRunStatus } from '../movement/movement.types.js';

/**
 * MOT CUA SO tu man hinh hien truong nhin sang `transport-core` — CHI DOC.
 *
 * Cung khuon `TransportCheckpointCoreFacts`, va cung ly le: T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC. Mot man hinh CHI DOC ma cam
 * `MovementRepository` la mot cai but nam trong tui cua nguoi khong duoc phep viet.
 *
 * `orderCode` chu khong `orderId` o be mat lai xe: quy uoc cua `navigation.ts` cam mot ma ky thuat
 * di len dia chi hay len man hinh. Ca hai deu co trong `FieldLegFacts` vi ma ky thuat van can de
 * bam nut — nhung tang doc chon cai nao di ra ngoai.
 */

export interface FieldRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

export interface FieldLegFacts {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly orderId: string | null;
}

export abstract class TransportFieldCoreFacts {
  /**
   * Vong chay CON MO cua mot lai xe.
   *
   * "Con mo", khong phai "tat ca": man hinh hien truong tra loi cau *"bay gio toi lam gi"*. Tra ve
   * ca lich su se lam mot lai xe chay lau nam phai cuon qua hang tram vong chay da xong de tim
   * chuyen dang chay — tren mot man hinh 390px.
   */
  abstract listOpenRunsForDriver(driverId: string): Promise<readonly FieldRunFacts[]>;
  abstract listLegs(runId: string): Promise<readonly FieldLegFacts[]>;
  /** Ma don doc duoc, cho ca lo. `null` khi don khong con/khong co. */
  abstract orderCodes(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

@Injectable()
export class TransportFieldCoreFactsAdapter extends TransportFieldCoreFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async listOpenRunsForDriver(driverId: string): Promise<readonly FieldRunFacts[]> {
    const runs = await this.movement.listOpenRunsForDriver(driverId);
    return runs.map((run) => ({ id: run.id, code: run.code, status: run.status }));
  }

  async listLegs(runId: string): Promise<readonly FieldLegFacts[]> {
    const legs = await this.movement.listLegs(runId);
    return legs.map((leg) => ({
      id: leg.id,
      runId: leg.runId,
      sequence: leg.sequence,
      kind: leg.kind,
      originLabel: leg.originLabel,
      destinationLabel: leg.destinationLabel,
      orderId: leg.orderId,
    }));
  }

  /**
   * MOT lan doc ca danh sach don chu khong `findOrder(id)` cho tung chang.
   *
   * Cung ly le da ghi o `ControlTowerCoreFacts.listOrders()`: tra cuu tung don se la mot vong N+1
   * nam ngay trong duong ve cua man hinh ma lai xe mo lai nhieu lan nhat trong ngay — tren mang di
   * dong.
   */
  async orderCodes(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (orderIds.length === 0) return new Map();
    const wanted = new Set(orderIds);
    const orders = await this.movement.listOrders();
    return new Map(
      orders.filter((order) => wanted.has(order.id)).map((order) => [order.id, order.code]),
    );
  }
}
