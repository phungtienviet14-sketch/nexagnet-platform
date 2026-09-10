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
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import { planCancelSchema, planCommitSchema, planPreviewSchema } from './planning.schemas.js';
import { PlanningService } from './planning.service.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * LAP KE HOACH VONG CHAY qua HTTP — #276 (Lane L).
 *
 * ============================================================================================
 * BE MAT NAY LAY DON LAM TRUNG TAM
 * ============================================================================================
 *
 * Moi duong ghi deu bat dau bang `orders/:orderId`. Do khong phai mot lua chon ve URL cho dep:
 * `#274` chot *"Boss/accounting operate Orders; normal flow does not require manual Run close."*
 * Mot be mat `runs/:runId/legs` de dieu xe tu dung nhung chang la be mat CU, va no van con —
 * nhung no khong con la duong ma quy trinh binh thuong di qua.
 *
 * ============================================================================================
 * `preview` LA `POST` NHUNG KHONG GHI GI
 * ============================================================================================
 *
 * `POST` vi no can mot than yeu cau (xe + km du kien), khong vi no doi trang thai. `#276` L7:
 * *"The preview must be side-effect free."* Nen no mang quyen `transport.run.read` chu khong
 * `.manage`, va khong khai `@Roles` — bat ky ai doc duoc vong chay deu xem truoc duoc.
 *
 * ============================================================================================
 * KHONG CON NUT "DONG VONG CHAY" — `#293` R1
 * ============================================================================================
 *
 * `POST runs/:runId/closure` da BI GO BO. No tung khong ep dong duoc (no chay lai dung phan xu tat
 * dinh), nhung no van la mot lan bam cua NGUOI lam cho vong chay chuyen sang `COMPLETED`. Cau hoi
 * `#293` R1 dat ra khong phai *"co ep duoc khong"* ma *"co phai bam khong"* — va cau tra loi phai
 * la khong: dong vong chay la quyen cua HE THONG.
 *
 * Cai con lai la `GET runs/:runId/closure`: mot be mat CHAN DOAN, chi doc, tra loi *"dong duoc
 * chua va neu chua thi vi sao"*. No khong doi mot hang nao, va noi dung cung bang chan voi duong
 * he thong dung de quyet dinh (`RunClosureService.inspect`).
 *
 * Cau hoi cu — *"nhanh `IDLE_TIMEOUT` khong co su kien nao danh thuc thi ai goi?"* — nay co mot
 * cau tra loi that: `RunClosureSweepScheduler`, mot luot quet dinh ky, khong giu trang thai nao,
 * va doc lai su that nguon moi luot.
 */
@Controller('transport/planning')
@UseGuards(TransportActionGuard)
export class TransportPlanningController {
  constructor(
    private readonly planning: PlanningService,
    /**
     * `#293` R2. Mot duong phan xu duy nhat: controller bao "su that vua doi", khong tu ghep su
     * that lai. `LEG_CHANGED` nam o `RunsController`; o day la `PLAN_CANCELLED`.
     */
    private readonly closures: RunClosureService,
  ) {}

  /** Chinh sach dang ap dung. Be mat CHAN DOAN — `#276` L1. */
  @Get('policy')
  @RequiresTransportAction('transport.run.read')
  policy() {
    return this.planning.describePolicy();
  }

  @Get('orders/:orderId/plans')
  @RequiresTransportAction('transport.run.read')
  plans(@Param('orderId') orderId: string) {
    return this.guard(() => this.planning.plansOfOrder(orderId));
  }

  @Post('orders/:orderId/preview')
  @RequiresTransportAction('transport.run.read')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  preview(@Param('orderId') orderId: string, @Body() body: unknown) {
    const input = this.parse(planPreviewSchema, body);
    return this.guard(() =>
      this.planning.preview(orderId, {
        vehicleId: input.vehicleId,
        distanceHint: {
          emptyKm: input.plannedEmptyKm ?? null,
          loadedKm: input.plannedLoadedKm ?? null,
        },
      }),
    );
  }

  @Post('orders/:orderId/plan')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  commit(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(planCommitSchema, body);
    return this.guard(() =>
      this.planning.commit(
        orderId,
        {
          vehicleId: input.vehicleId,
          idempotencyKey: input.idempotencyKey,
          distanceHint: {
            emptyKm: input.plannedEmptyKm ?? null,
            loadedKm: input.plannedLoadedKm ?? null,
          },
        },
        transportActorOf(request),
      ),
    );
  }

  @Post('plans/:planId/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  cancel(
    @Param('planId') planId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason } = this.parse(planCancelSchema, body);
    return this.guard(async () => {
      const plan = await this.planning.cancelPlan(planId, reason, transportActorOf(request));
      /*
       * GO KE HOACH CUOI CUNG LA MOT SU THAT LAM VONG CHAY CO THE DONG DUOC (`#293` R2: *"plan
       * cancellation removes final future work"*).
       *
       * Su that doi SAU khi lenh huy da ghi xong, nen lan phan xu nay chay tren trang thai da ben
       * vung. No khong nem: mot vong chay chua du dieu kien tra ve `closed: false` kem ly do, va do
       * la mot ket qua binh thuong — lop huy ke hoach khong duoc hong chi vi phan xu sau no khong
       * dong duoc gi.
       */
      const closure = await this.closures.attempt(plan.runId, 'PLAN_CANCELLED');
      return { plan, closure };
    });
  }

  /** Diem ket thuc du kien cua mot chiec xe — nguon cho Lane M (`#276` L7). */
  @Get('vehicles/:vehicleId/projection')
  @RequiresTransportAction('transport.run.read')
  projection(@Param('vehicleId') vehicleId: string) {
    return this.guard(() => this.planning.projectVehicle(vehicleId));
  }

  /**
   * Phan xu dong vong chay, KHONG thi hanh. Be mat CHAN DOAN — `#293` R1.
   *
   * Doc cung bang chan voi duong ma he thong dung de quyet dinh, ke ca nguon su that ben ngoai
   * (`RunClosureService.inspect`), nen mot cau "dong duoc" o day la mot cau dung.
   *
   * KHONG co duong `POST` tuong ung: xem chu thich dau lop.
   */
  @Get('runs/:runId/closure')
  @RequiresTransportAction('transport.run.read')
  closure(@Param('runId') runId: string) {
    return this.guard(() => this.closures.inspect(runId));
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
