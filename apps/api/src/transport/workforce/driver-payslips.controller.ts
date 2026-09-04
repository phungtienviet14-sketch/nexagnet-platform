import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import type { DriverPayslipView } from './driver-payslip.view.js';
import { WorkforceReadService } from './workforce-read.service.js';

/**
 * BE MAT LAI XE cho PHIEU LUONG — `#168 B8`, `GD-23`, VT-083.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/payslips`), khong phai vai
 * nhanh `if` trong `PayrollController`. Bon dieu duoc bao dam bang CAU TRUC chu khong bang ky luat:
 *
 *   1. moi handler tra `DriverPayslipView` — mot KIEU khong co `runBy`, `approvedBy`, `paidBy`,
 *      `component.recordedBy`, va khong co mot truong doanh thu/cuoc/bien nao. Them mot truong vao
 *      `Payslip` khong lam gi duoc o day ca;
 *   2. khong route nao nhan `:driverId` hay mot tham so truy van nao — danh tinh CHI den tu phien
 *      (`requireAuthUserId` -> `Driver.authUserId`);
 *   3. CHI CO `GET`. `transport.driver.self.payslip.read` khong mo mot duong ghi nao: duyet, chi
 *      tra, phat phieu bu deu o `PayrollController` sau `transport.payslip.*`, va lai xe khong giu
 *      mot ma nao trong so do. Mot route khong ton tai la mot route khong ai goi nham;
 *   4. quy tac cong bo (`DRAFT` khong ra ngoai) nam trong `toDriverPayslipView`, tuc trong CHINH
 *      phep sinh ra kieu tra ve — khong phai mot bo loc dat o controller nay ma duong doc thu hai
 *      sau nay se quen.
 *
 * `transport.driver.self.payslip.read` chu KHONG `transport.payroll.period.read`: ma van hanh kia
 * doc duoc ky luong, lan chay va phieu cua BAT KY lai xe nao. Xem khoi chu thich cua no trong
 * `transport-actions.ts`.
 */
@Controller('transport/me/payslips')
@UseGuards(TransportActionGuard)
export class DriverPayslipsController {
  constructor(private readonly read: WorkforceReadService) {}

  /**
   * LICH SU LUONG CUA CHINH TOI — ca chuoi sua, khong chi ban goc.
   *
   * KHONG co tham so loc theo ky hay phan trang. Mot lai xe co mot phieu goc moi ky, cong vai phieu
   * bu hiem hoi — them mot bo loc o day se la mot be mat can bao tri de phuc vu mot danh sach ma
   * dien thoai cuon het trong mot lan.
   */
  @Get()
  @RequiresTransportAction('transport.driver.self.payslip.read')
  list(@Req() request: AuthenticatedRequest): Promise<DriverPayslipView[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.read.listMyPayslips(authUserId));
  }

  @Get(':payslipId')
  @RequiresTransportAction('transport.driver.self.payslip.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('payslipId') payslipId: string,
  ): Promise<DriverPayslipView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.read.getMyPayslip(authUserId, payslipId));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
