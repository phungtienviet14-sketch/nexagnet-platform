import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import type { DriverSettlementSelfStatement } from './driver-settlement.types.js';

/**
 * BE MAT LAI XE cho BANG QUYET TOAN — `TX-07b`, cung khuon `DriverPayslipsController` cua `#168 B8`.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/settlement`), khong phai
 * vai nhanh `if` trong `DriverSettlementController`. Ba dieu duoc bao dam bang CAU TRUC:
 *
 *   1. tra ve `DriverSettlementSelfStatement` — mot KIEU khong co `fundBalance` tho va khong co
 *      `recordedBy`. Lai xe doc `reimbursementOutstanding`, mot so DUONG kem nghia "cong ty con
 *      tra lai ban", chu khong phai mot so du am ma `DA-T3-01` canh bao la de doc nguoc thanh
 *      "ban dang no";
 *   2. khong route nao nhan `:driverId` hay mot tham so truy van nao — danh tinh CHI den tu phien;
 *   3. CHI CO `GET`. `transport.driver.self.settlement.read` khong mo mot duong ghi nao: chi tien
 *      va dao deu nam o `DriverSettlementController` sau `transport.driver_settlement.*`, va lai
 *      xe khong giu mot ma nao trong so do. Mot nguoi tu chi tien cho chinh minh la dung cai ma
 *      kiem soat noi bo sinh ra de chan.
 */
@Controller('transport/me/settlement')
@UseGuards(TransportActionGuard)
export class DriverSettlementSelfController {
  constructor(private readonly read: DriverSettlementReadService) {}

  @Get()
  @RequiresTransportAction('transport.driver.self.settlement.read')
  async statement(@Req() request: AuthenticatedRequest): Promise<DriverSettlementSelfStatement> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.read.selfStatement(authUserId);
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
