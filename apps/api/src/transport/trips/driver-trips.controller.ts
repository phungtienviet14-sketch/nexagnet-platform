import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { driverTripStatusSchema, firstIssue } from '../transport.schemas.js';
import type { DriverTripView } from './driver-trip.view.js';
import { TripService } from './trip.service.js';

/**
 * BE MAT LAI XE — `GD-23`, `INV-09`, VT-083.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/trips`), khong phai vai
 * nhanh `if` trong `TripsController`. Ba dieu duoc bao dam bang CAU TRUC chu khong bang ky luat:
 *
 *   1. moi handler o day tra `DriverTripView` — mot KIEU khong co truong doanh thu. Them
 *      `freightAmount` vao `Trip` khong lam gi duoc o day ca;
 *   2. pham vi "chuyen cua chinh toi" duoc chot bang QUYEN SO HUU PHAN CONG trong `TripService`,
 *      khong phai bang vai `SALE` — hai lai xe khac nhau van cung mot vai, nen vai khong the la
 *      cong;
 *   3. khong route nao o day nhan `:driverId` tu nguoi goi. Danh tinh chi den tu phien.
 *
 * `@Roles('SALE', 'ADMIN')`: `SALE` la CHO GIU TAM cho vai lai xe (`GD-22`) — nen tang chua co vai
 * `DRIVER`. `ADMIN` giu de nguoi ho tro con mo duoc man hinh lai xe khi di tim su co; ho van chi
 * thay chuyen cua ho so lai xe duoc noi voi chinh tai khoan minh, va thuong la khong co cai nao.
 */
@Controller('transport/me/trips')
@UseGuards(TransportActionGuard)
export class DriverTripsController {
  constructor(private readonly trips: TripService) {}

  @Get()
  @RequiresTransportAction('transport.driver.self.trip.read')
  list(@Req() request: AuthenticatedRequest): Promise<DriverTripView[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.trips.listDriverTrips(authUserId));
  }

  @Get(':id')
  @RequiresTransportAction('transport.driver.self.trip.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<DriverTripView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.trips.getDriverTrip(authUserId, id));
  }

  @Patch(':id/status')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.trip.update')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverTripView> {
    const authUserId = requireAuthUserId(request);
    const parsed = driverTripStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(() => this.trips.updateDriverTripStatus(authUserId, id, parsed.data.to));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
