import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { AssetOwnershipScopeService } from './asset-ownership-scope.service.js';
import { StakeholderActivityService } from './stakeholder-activity.service.js';
import type { StakeholderActivityView } from './stakeholder-activity.js';
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
  constructor(
    private readonly scope: AssetOwnershipScopeService,
    private readonly activityService: StakeholderActivityService,
  ) {}

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

  /**
   * HOAT DONG cua chinh nhung chiec xe do (`#278` N9).
   *
   * ---------------------------------------------------------------------------
   * KHAI TRUOC `:vehicleId` — VA DO KHONG PHAI CHUYEN THAM MY.
   *
   * Nest doi khop theo DUNG THU TU khai bao. Neu dong nay nam duoi `@Get(':vehicleId')`, chuoi
   * `activity` se roi vao tham so duong dan, doi chieu pham vi that bai, va nguoi dung nhan `403`
   * "khong co quyen xem xe da yeu cau" cho mot chiec xe khong he ton tai. Bai
   * `stakeholder-activity.composition.spec.ts` khoa dung thu tu nay lai.
   *
   * CUNG MOT MA QUYEN voi hai duong tren: day khong phai mot quyen moi, ma la them cot cho dung
   * nhung chiec xe nguoi ta da duoc phep xem. `#278` N9 gioi han o *"already authorized fields"*.
   */
  @Get('activity')
  @RequiresTransportAction('transport.stakeholder.self.vehicle.read')
  async activity(
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StakeholderActivityView> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.activityService.activity(authUserId, from, to);
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
