import { Injectable } from '@nestjs/common';
import { CounterpartySiteRepository } from '../counterparty/site.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';

/**
 * BA CUA SO tu chung tu van hanh nhin sang cac mien khac. Ca ba CHI DOC.
 *
 * Cung khuon `TransportCheckpointCoreFacts`, va cung ly le: T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat. Mien chung
 * tu KHONG duoc tiem `MovementRepository` hay `CounterpartySiteRepository` truc tiep; no duoc tiem
 * ba cong duoi day, va **khong cong nao co mot ham ghi**.
 *
 * ============================================================================================
 * `orderId` DUOC GIAI O MAY CHU, VA DO LA MOT CONG
 * ============================================================================================
 *
 * `DocumentLegFacts.orderId` la ly do cong nay ton tai chu khong dung lai `CheckpointLegFacts`.
 *
 * `#279` O13 bai 8 doi: *"DELIVERY_RECEIPT for Order A cannot satisfy Order B"*. Neu ben goi khai
 * duoc `orderId` thi ho gan duoc mot to bien nhan cua don nay sang don khac — va Lane K se doc no
 * nhu mot can cu hop le. Nen ma don KHONG BAO GIO den tu than yeu cau: no duoc giai tu chinh chang
 * ma lai xe dang chay.
 */

export interface DocumentRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

export interface DocumentLegFacts {
  readonly id: string;
  readonly runId: string;
  /** Don thuong mai cua chang. `null` o chang RONG — mot chang rong khong mang don. */
  readonly orderId: string | null;
}

export abstract class TransportDocumentCoreFacts {
  abstract findRun(runId: string): Promise<DocumentRunFacts | null>;
  abstract findLeg(legId: string): Promise<DocumentLegFacts | null>;
  /** Nhung chang cua mot DON — de doi chieu mot chung tu vien dan voi don cua no. */
  abstract legIdsForOrder(orderId: string): Promise<readonly string[]>;
  abstract orderExists(orderId: string): Promise<boolean>;
}

@Injectable()
export class TransportDocumentCoreFactsAdapter extends TransportDocumentCoreFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async findRun(runId: string): Promise<DocumentRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run ? { id: run.id, code: run.code, status: run.status } : null;
  }

  async findLeg(legId: string): Promise<DocumentLegFacts | null> {
    const leg = await this.movement.findLeg(legId);
    return leg ? { id: leg.id, runId: leg.runId, orderId: leg.orderId } : null;
  }

  async legIdsForOrder(orderId: string): Promise<readonly string[]> {
    const legs = await this.movement.listLegsByOrders([orderId]);
    return legs.filter((leg) => leg.orderId === orderId).map((leg) => leg.id);
  }

  async orderExists(orderId: string): Promise<boolean> {
    return (await this.movement.findOrder(orderId)) !== null;
  }
}

/**
 * DIA DIEM VAN HANH cua Lane H — mot cau hoi, mot cau tra loi.
 *
 * `#279` O3: *"Do not let OCR name create a new Counterparty/Site automatically."* Cong nay chi
 * HOI mot dia diem co that hay khong; no khong co ham tao. Mot ten doc ra tu mot to phieu khong co
 * duong nao tro thanh mot hang trong danh muc dia diem.
 */
export abstract class TransportDocumentSiteFacts {
  abstract exists(counterpartySiteId: string): Promise<boolean>;
}

@Injectable()
export class TransportDocumentSiteFactsAdapter extends TransportDocumentSiteFacts {
  constructor(private readonly sites: CounterpartySiteRepository) {
    super();
  }

  async exists(counterpartySiteId: string): Promise<boolean> {
    return (await this.sites.find(counterpartySiteId)) !== null;
  }
}
