import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { AssetOwnershipScopeService } from './asset-ownership-scope.service.js';
import type { StakeholderVehicleView } from './asset-ownership.types.js';

/**
 * BE MAT BEN HUU QUAN — "Xe toi co co phan" (`TX-08`, #242 E3/E5).
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng, cung khuon `DriverFundSelfController`.
 * Bon dieu duoc bao dam bang CAU TRUC chu khong bang mot bo loc ai do phai nho viet:
 *
 *   1. khong route nao nhan `stakeholderId` — danh tinh CHI den tu phien;
 *   2. `:vehicleId` co nhan, nhung `AssetOwnershipScopeService.myVehicle()` doi chieu no voi tap xe
 *      CUA CHINH nguoi dang xem truoc khi doc bat cu thu gi. Doi tham so tren duong dan khong mo
 *      duoc xe cua nguoi khac, va ca hai truong hop ("khong ton tai" / "khong thuoc pham vi") tra
 *      ve CUNG mot cau tra loi — neu khac nhau, duong nay se thanh mot cong dem ca doi xe;
 *   3. `StakeholderVehicleView` khong co truong gia cuoc, bien truc tiep, cong no hay toa do nao,
 *      nen pham vi duong tinh cua #242 E3 duoc giu bang KIEU DU LIEU;
 *   4. chi co `GET`. Mot dong so huu KHONG dieu duoc xe, khong sua duoc ty le cua chinh minh, va
 *      khong ghi duoc mot dong nao vao du lieu van hanh — nen o day khong co mot duong ghi nao de
 *      ma tranh luan ve quyen.
 */
@Controller('transport/me/vehicles')
@UseGuards(TransportActionGuard)
export class StakeholderVehiclesController {
  constructor(private readonly scope: AssetOwnershipScopeService) {}

  @Get()
  @RequiresTransportAction('transport.stakeholder.self.vehicle.read')
  async list(@Req() request: AuthenticatedRequest): Promise<StakeholderVehicleView[]> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.scope.myVehicles(authUserId);
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }

  @Get(':vehicleId')
  @RequiresTransportAction('transport.stakeholder.self.vehicle.read')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<StakeholderVehicleView> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.scope.myVehicle(authUserId, vehicleId);
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
