import { Injectable } from '@nestjs/common';
import { MovementRepository } from '../movement/movement.repository.js';

/**
 * CUA SO THU HAI tu `transport-costing` nhin sang `transport-core` — `#369` R-4, CHI DOC: vong chay /
 * chang / lich su phan cong lam NGU CANH cho mot khoan chi Run-first tu Quy lai xe.
 *
 * ===========================================================================
 * VI SAO MOT CONG RIENG chu khong them ham vao `TransportCoreFacts`
 *
 * `TransportCoreFacts` tra loi ve CHUYEN v1 — truc ma `TX-03` giu nguyen tu T3. Vong chay la mot truc
 * KHAC (`D-01`: Run khong la cha hay con cua Trip). Dat hai truc vao mot cong se buoc moi ben goi va
 * moi ban gia lap cua cong cu phai biet toi vong chay. Cung khuon voi `FuelRunContextFacts` cua
 * `transport-fuel` (`#364`).
 *
 * ===========================================================================
 * KHONG CO MOT HAM GHI NAO — T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) giu bang KIEU.
 *
 * Moi dieu duoc hoi o day KHONG DOI sau khi tao: `runId` cua chang, va lich su phan cong (chi them —
 * "tung" duoc phan cong thi mai mai "tung"). Nen khong co cua so TOCTOU nao can khoa vong chay.
 *
 * `CostingRunFacts` co y NGHEO: khong doanh thu, khong don hang (`INV-09`).
 */

export interface CostingRunFacts {
  readonly id: string;
  readonly code: string;
  readonly vehicleId: string;
}

export interface CostingLegFacts {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
}

export abstract class CostingRunContextFacts {
  abstract findRun(runId: string): Promise<CostingRunFacts | null>;
  abstract findLeg(legId: string): Promise<CostingLegFacts | null>;
  /**
   * Lai xe nay CO TUNG duoc phan cong vao vong chay do — ke ca ban phan cong DA DONG.
   *
   * "Tung", khong phai "dang": cung ly le voi `wasDriverEverAssignedToTrip` (`GD-06`, `DA-T3-04`) —
   * nguoi bi thay ca van chiu trach nhiem cho phan duong ho da chay, va van phai ghi duoc khoan chi
   * cua doan do vao quy CUA HO.
   */
  abstract wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean>;
}

/**
 * Hien thuc DUY NHAT — qua `MovementRepository` cua `transport-core`, capability ma
 * `transport-costing` da phu thuoc san (`tenant.schema.ts`). Khong them mot phu thuoc capability nao.
 */
@Injectable()
export class MovementCostingRunContextAdapter extends CostingRunContextFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async findRun(runId: string): Promise<CostingRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run ? { id: run.id, code: run.code, vehicleId: run.vehicleId } : null;
  }

  async findLeg(legId: string): Promise<CostingLegFacts | null> {
    const leg = await this.movement.findLeg(legId);
    return leg ? { id: leg.id, runId: leg.runId, sequence: leg.sequence } : null;
  }

  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    const history = await this.movement.listRunAssignments(runId);
    return history.some((assignment) => assignment.driverId === driverId);
  }
}
