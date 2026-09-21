import { Injectable } from '@nestjs/common';
import { LegFieldTruthSource, type LegFieldDelivery } from '../movement/leg-field-truth.port.js';
import { CheckpointRepository } from './checkpoint.repository.js';
import { deriveLegPhase } from './run-timeline.js';

/**
 * SO GHI HIEN TRUONG cua mot chang, cho `transport-core` hoi truoc khi hoan tat chang CO HANG —
 * `#332`.
 *
 * Khong mot luat moi nao: "da giao" la giai doan `DELIVERED` cua CHINH phep chieu `deriveLegPhase()`
 * ma man lai xe, thap dieu hanh va nguon chan `CARGO_STILL_CARRIED` cung doc. Mot dinh nghia "da
 * giao" thu hai o day se lech voi ban kia o lan sua dau tien.
 *
 * Doc thang kho moc, KHONG bat loi: kho hong thi `MovementService.transitionLeg()` phai that bai
 * dong, khong phai nhan mot cau "chua giao" hay "da giao" bia ra.
 */
@Injectable()
export class CheckpointLegFieldTruthSource extends LegFieldTruthSource {
  constructor(private readonly checkpoints: CheckpointRepository) {
    super();
  }

  async deliveryOf(legId: string): Promise<LegFieldDelivery> {
    const rows = await this.checkpoints.listForLeg(legId);
    const phase = deriveLegPhase(rows.map((row) => row.type));
    return { delivered: phase === 'DELIVERED', phase };
  }
}
