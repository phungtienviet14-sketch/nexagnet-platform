import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { DriverFieldReadService } from './field-read.service.js';
import type { DriverFieldWork } from './field.types.js';

/**
 * MAN HINH HIEN TRUONG cua lai xe — `#279` O9.
 *
 * MOT tuyen, CHI DOC. Do la ca thiet ke: man hinh nay khong ghi gi ca — no tra ve mot danh sach
 * NUT, va moi nut tro toi mot tuyen ghi DA CO (`/transport/me/checkpoints`,
 * `/transport/me/waiting-sessions`, `/transport/me/documents`, `/transport/me/receipt-handovers`).
 *
 * Nho vay khong co duong ghi THU HAI nao ra doi cung man hinh nay: moi phep kiem quyen so huu,
 * moi khoa chong lap, moi luat thu tu van nam o dung noi chung da nam.
 *
 * `requiredAction` la ma GHI MOC (`transport.driver.self.checkpoint.record`) chu khong mot ma doc
 * rieng, va do la mot lua chon co y: man hinh nay CHI co nghia voi nguoi thuc su ghi duoc moc.
 * Che them mot ma `.field.read` se la mot ma khong ai dung mot minh, va moi khach van tai sau deu
 * phai mang no.
 */
@Controller('transport/me/field-work')
@UseGuards(TransportActionGuard)
export class DriverFieldController {
  constructor(private readonly field: DriverFieldReadService) {}

  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.checkpoint.record')
  async work(@Req() request: AuthenticatedRequest): Promise<DriverFieldWork> {
    const authUserId = requireAuthUserId(request);
    try {
      return await this.field.workFor(authUserId);
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
