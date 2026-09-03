import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { OperationalAlertsService } from './operational-alerts.service.js';

/**
 * MOT MAN HINH canh bao cho Giam doc — VT-015 ("tong hop chung vao mot man hinh"), VT-065 ("gop
 * vao mot dashboard canh bao het han duy nhat").
 *
 * Tra ve CA `unavailableSources`. Mot bang canh bao thieu mot muc vi khach tat capability phai noi
 * ra dieu do; im lang se lam bang do doc giong het mot bang bao rang moi thu deu on.
 */
@Controller('transport/alerts')
@UseGuards(TransportActionGuard)
export class OperationalAlertsController {
  constructor(private readonly alerts: OperationalAlertsService) {}

  @Get()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.alerts.read')
  async feed() {
    try {
      return await this.alerts.feed();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
