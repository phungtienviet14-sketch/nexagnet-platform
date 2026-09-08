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
 * `closure` KHONG PHAI NUT "DONG VONG CHAY"
 * ============================================================================================
 *
 * `POST runs/:runId/closure` KHONG nhan mot y muon nao va KHONG the ep dong: no chay lai dung
 * phan xu tat dinh cua `evaluateRunClosure()` va thi hanh ket qua. Goi no tren mot vong chay chua
 * du dieu kien tra ve `closed: false` kem danh sach ly do — khong phai mot loi, va khong phai mot
 * lan dong.
 *
 * No ton tai vi mot ly do cu the: nhanh `IDLE_TIMEOUT` khong co su kien nao danh thuc. Dong theo
 * bai xe duoc kich hoat boi chinh lan chang cuoi ket thuc; dong theo gio nghi thi phai co ai do
 * hoi lai. Cho toi khi nen tang co mot bo lap lich, "ai do" la mot lan quet — khong phai mot
 * quyet dinh cua ke toan.
 */
@Controller('transport/planning')
@UseGuards(TransportActionGuard)
export class TransportPlanningController {
  constructor(private readonly planning: PlanningService) {}

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
    return this.guard(() => this.planning.cancelPlan(planId, reason, transportActorOf(request)));
  }

  /** Diem ket thuc du kien cua mot chiec xe — nguon cho Lane M (`#276` L7). */
  @Get('vehicles/:vehicleId/projection')
  @RequiresTransportAction('transport.run.read')
  projection(@Param('vehicleId') vehicleId: string) {
    return this.guard(() => this.planning.projectVehicle(vehicleId));
  }

  /** Phan xu dong vong chay, KHONG thi hanh. */
  @Get('runs/:runId/closure')
  @RequiresTransportAction('transport.run.read')
  closure(@Param('runId') runId: string) {
    return this.guard(() => this.planning.inspectClosure(runId));
  }

  /** Chay lai phan xu va thi hanh neu du dieu kien. Khong ep duoc — xem chu thich dau lop. */
  @Post('runs/:runId/closure')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  settle(@Param('runId') runId: string) {
    return this.guard(() => this.planning.settleRunClosure(runId));
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
