import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { CostingReadService } from './costing-read.service.js';
import type { DriverFundStatement } from './costing.types.js';

/**
 * BE MAT LAI XE cho SO QUY — `GD-23`, VT-083.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/fund`), khong phai mot
 * nhanh `if` trong `DriverFundController`. Ba dieu duoc bao dam bang CAU TRUC:
 *
 *   1. khong route nao o day nhan `:driverId` — danh tinh CHI den tu phien;
 *   2. `DriverFundStatement` khong co truong doanh thu nao, nen `INV-09` duoc giu bang KIEU DU LIEU
 *      chu khong bang mot bo loc ai do phai nho viet;
 *   3. pham vi "so quy cua chinh toi" duoc chot bang cau noi `Driver.authUserId` trong
 *      `CostingReadService`, khong bang vai `SALE` — hai lai xe khac nhau van cung mot vai, nen vai
 *      khong the la cong.
 *
 * Chi co MOT route, va la `GET`: lai xe DOC duoc so quy cua minh, khong ghi duoc mot dong nao vao
 * no. Ai chi bao nhieu la mot su that ke toan, khong phai mot lua chon cua nguoi tieu tien.
 */
@Controller('transport/me/fund')
@UseGuards(TransportActionGuard)
export class DriverFundSelfController {
  constructor(private readonly read: CostingReadService) {}

  @Get()
  @RequiresTransportAction('transport.driver.self.fund.read')
  async statement(@Req() request: AuthenticatedRequest): Promise<DriverFundStatement> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.read.selfFundStatement(authUserId);
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
