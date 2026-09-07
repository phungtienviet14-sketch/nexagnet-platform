import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import {
  addFuelStationAliasSchema,
  createFuelStationSchema,
  listFuelStationsQuerySchema,
  resolveFuelStationQuerySchema,
  updateFuelStationSchema,
  updateFuelSupplierProfileSchema,
} from './fuel-station.schemas.js';
import { FuelStationService } from './fuel-station.service.js';

/**
 * DANH TINH CAY XANG qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * ===========================================================================
 * KHONG CO `DELETE /stations/:id`, va do la mot quyet dinh chu khong mot thieu sot.
 *
 * Mot tram da tung nhan chung tu ma bien mat se lam moi chung tu cu tro vao hu khong. Duong dung
 * la `PATCH { status: 'INACTIVE' }` — no giu lich su va van doc duoc. `DELETE` chi ton tai cho BI
 * DANH, vi mot bi danh la mot lan quyet cua nguoi chu khong mot su kien nghiep vu.
 *
 * ===========================================================================
 * `GET stations/resolve` KHAI TRUOC `GET stations/:id`
 *
 * Nest gan route theo THU TU KHAI BAO, va hai duong nay cung so doan — `:id` se nuot `resolve` neu
 * dat truoc. Day dung la bay ma `#169` da vap mot lan.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelStationController {
  constructor(private readonly stations: FuelStationService) {}

  /**
   * NHAN MOT CAY XANG TU MOT CHUNG TU.
   *
   * `.read` chu khong mot ma moi: day la mot phep DOC tren cung tap du lieu ma `GET stations` da
   * tra ve, chi khac CACH HOI. Che mot quyen moi cho mot phep truy van moi tren cung mot tap se
   * lam bang phan quyen mo ta CONG NGHE thay vi mo ta NGHIEP VU.
   */
  @Get('stations/resolve')
  @RequiresTransportAction('transport.fuel.station.read')
  resolve(@Query() query: unknown) {
    const parsed = resolveFuelStationQuerySchema.parse(query ?? {});
    return this.guard(() =>
      this.stations.resolveStation({
        supplierId: parsed.supplierId ?? null,
        code: parsed.code ?? null,
        label: parsed.label ?? null,
      }),
    );
  }

  @Get('stations')
  @RequiresTransportAction('transport.fuel.station.read')
  list(@Query() query: unknown) {
    const parsed = listFuelStationsQuerySchema.parse(query ?? {});
    return this.guard(() => this.stations.listStations(parsed.supplierId ?? null));
  }

  @Get('stations/:id')
  @RequiresTransportAction('transport.fuel.station.read')
  detail(@Param('id') id: string) {
    return this.guard(() => this.stations.stationDetail(id));
  }

  @Post('stations')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.station.manage')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createFuelStationSchema, body);
    return this.guard(() => this.stations.createStation(input, transportActorOf(request)));
  }

  @Patch('stations/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.station.manage')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const patch = this.parse(updateFuelStationSchema, body);
    return this.guard(() => this.stations.updateStation(id, patch, transportActorOf(request)));
  }

  @Post('stations/:id/aliases')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.station.manage')
  addAlias(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { raw } = this.parse(addFuelStationAliasSchema, body);
    return this.guard(() => this.stations.addAlias(id, raw, transportActorOf(request)));
  }

  /** Go mot bi danh. Idempotent: goi lai tra `{ removed: false }`, khong phai `404`. */
  @Delete('stations/:id/aliases/:aliasId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.station.manage')
  removeAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.guard(async () => ({
      removed: await this.stations.removeAlias(id, aliasId, transportActorOf(request)),
    }));
  }

  /**
   * SIEU DU LIEU HOP DONG cua mot nha cung cap.
   *
   * `.station.read`/`.station.manage` chu khong `.entry.*`: day la MASTER DATA cua cung mot man
   * hinh danh muc, va tach quyen theo BANG se lam nguoi dung mo duoc danh sach tram ma khong mo
   * duoc ho so nha cung cap dang so huu chung.
   */
  @Get('suppliers/:id/profile')
  @RequiresTransportAction('transport.fuel.station.read')
  supplierProfile(@Param('id') id: string) {
    return this.guard(() => this.stations.supplierProfile(id));
  }

  @Patch('suppliers/:id/profile')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.station.manage')
  updateSupplierProfile(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateFuelSupplierProfileSchema, body);
    return this.guard(() =>
      this.stations.updateSupplierProfile(id, patch, transportActorOf(request)),
    );
  }

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
