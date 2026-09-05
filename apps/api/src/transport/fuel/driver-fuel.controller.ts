import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import type { DriverFuelSlipView } from './driver-fuel.view.js';
import { FuelReadService } from './fuel-read.service.js';
import { FuelService } from './fuel.service.js';
import { attachFuelEvidenceSchema, driverFuelSubmitSchema } from './fuel.schemas.js';

/**
 * BE MAT LAI XE cho phieu do dau — `GD-23`, `INV-09`, VT-083.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/fuel`), khong phai vai
 * nhanh `if` trong `FuelEntriesController`. Ba dieu duoc bao dam bang CAU TRUC:
 *
 *   1. moi handler DOC tra `DriverFuelSlipView` — mot KIEU khong co truong doanh thu, khong co
 *      `costExpenseId`, khong co `sourceStatementId`;
 *   2. `driverId` KHONG bao gio den tu than yeu cau: `driverFuelSubmitSchema` khong co truong do,
 *      va controller lay danh tinh tu phien roi tu dien vao;
 *   3. pham vi "phieu cua chinh toi" duoc chot bang QUYEN SO HUU trong `FuelReadService`, khong
 *      bang vai `SALE` — hai lai xe khac nhau van cung mot vai, nen vai khong the la cong.
 *
 * `GD-19` — demo ONLINE-ONLY: khong hang doi ngoai tuyen. Anh gui hong thi bao loi va cho thu lai;
 * hang doi la viec cua vo mobile (`PG-11`), khong phai cua mien.
 */
@Controller('transport/me/fuel')
@UseGuards(TransportActionGuard)
export class DriverFuelController {
  constructor(
    private readonly fuel: FuelService,
    private readonly read: FuelReadService,
  ) {}

  @Get('slips')
  @RequiresTransportAction('transport.driver.self.fuel.read')
  list(@Req() request: AuthenticatedRequest): Promise<DriverFuelSlipView[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.read.listMyFuelSlips(authUserId));
  }

  @Get('slips/:id')
  @RequiresTransportAction('transport.driver.self.fuel.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.read.getMyFuelSlip(authUserId, id));
  }

  /**
   * LAI XE NOP PHIEU CUA CHINH MINH.
   *
   * `driverId` duoc lay tu PHIEN qua `requireDriverBinding()`, khong tu than yeu cau. Do la ly do
   * schema o day khac schema cua be mat van hanh — mot truong `driverId` trong body se la duong de
   * mot lai xe nop phieu duoi ten nguoi khac, va khong mot bo loc nao phat hien duoc dieu do.
   */
  @Post('slips')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.fuel.submit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  submit(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    const input = this.parse(driverFuelSubmitSchema, body);
    return this.guard(async () => {
      const driver = await this.read.requireDriverBinding(authUserId);
      const entry = await this.fuel.submitFuelEntry(
        { ...input, driverId: driver.id },
        transportActorOf(request),
      );
      return this.read.getMyFuelSlip(authUserId, entry.id);
    });
  }

  @Post('slips/:id/evidence')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.fuel.submit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  attachEvidence(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    const input = this.parse(attachFuelEvidenceSchema, body);
    return this.guard(async () => {
      // DOC QUYEN SO HUU TRUOC KHI GHI. `getMyFuelSlip` nem `SELF_FUEL_SCOPE_NOT_OWNED` cho phieu
      // cua nguoi khac, nen mot lai xe khong gan duoc anh vao chung tu cua dong nghiep.
      await this.read.getMyFuelSlip(authUserId, id);
      await this.fuel.attachEvidence(id, input, transportActorOf(request));
      return this.read.getMyFuelSlip(authUserId, id);
    });
  }

  /**
   * CHUP LAI VA NOP LAI mot phieu bi tu choi — `#168 B5`.
   *
   * `fuel-lifecycle.ts` goi canh `REJECTED -> DECLARED` la "duong chay thuong ngay", nhung truoc
   * task nay khong controller nao phoi no ra — nen mot phieu bi tu choi la NGO CUT tren dien thoai
   * cua lai xe, du may trang thai va `FuelService.resubmitFuelEntry` deu da san sang.
   *
   * QUYEN SO HUU DUOC DOC TRUOC KHI GHI, dung khuon `attachEvidence` ngay tren: `getMyFuelSlip`
   * nem `SELF_FUEL_SCOPE_NOT_OWNED` cho phieu cua nguoi khac. Cat hanh dong thoi thi khong du — hai
   * lai xe khac nhau van mang cung mot vai `SALE`, nen vai khong the la cong.
   */
  @Post('slips/:id/resubmit')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.fuel.submit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  resubmit(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(async () => {
      await this.read.getMyFuelSlip(authUserId, id);
      await this.fuel.resubmitFuelEntry(id, transportActorOf(request));
      return this.read.getMyFuelSlip(authUserId, id);
    });
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
