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
import { TransportDomainError } from '../transport.errors.js';
import { firstIssue } from '../transport.schemas.js';
import { legCancelSchema, legTransitionSchema } from '../planning/planning.schemas.js';
import { PlanningService } from '../planning/planning.service.js';
import {
  addLegSchema,
  assignRunSchema,
  cancelSchema,
  createRunSchema,
  runTransitionSchema,
} from './movement.schemas.js';
import { MovementService } from './movement.service.js';
import { summariseRunDistance, summariseRunMovement } from './run-distance.js';

/**
 * VONG CHAY VAT LY qua HTTP.
 *
 * `GET :id/distance` la be mat ma R8 analytics se doc. No tra ca con so LAN dau day du hay khong
 * (`complete`) -- vi mot ty le rong tinh tren du lieu khuyet trong y het mot ty le that.
 */
@Controller('transport/runs')
@UseGuards(TransportActionGuard)
export class RunsController {
  constructor(
    private readonly movement: MovementService,
    /**
     * Lane L (#276). Chieu phu thuoc di MOT huong: controller -> planning -> movement. Doi trang
     * thai mot chang la mot su that VAN HANH; ai do phai hoi lai "vong chay nay xong chua" ngay
     * sau do, va cau hoi do thuoc lop lap ke hoach chu khong thuoc `MovementService`.
     */
    private readonly planning: PlanningService,
  ) {}

  @Get()
  @RequiresTransportAction('transport.run.read')
  list() {
    return this.movement.listRuns();
  }

  /** Doc phep chieu cua mot chuyen v1 -- `null` khi chua chieu. */
  @Get('projections/trip/:tripId')
  @RequiresTransportAction('transport.run.read')
  projection(@Param('tripId') tripId: string) {
    return this.guard(() => this.movement.findProjection(tripId));
  }

  /** TAT DINH va LAP LAI DUOC: goi hai lan tren cung mot chuyen tra ve cung mot ket qua. */
  @Post('projections/trip/:tripId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  project(@Param('tripId') tripId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.movement.projectTrip(tripId, transportActorOf(request)));
  }

  @Get(':id')
  @RequiresTransportAction('transport.run.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.movement.getRun(id));
  }

  @Get(':id/distance')
  @RequiresTransportAction('transport.run.read')
  distance(@Param('id') id: string) {
    return this.guard(async () => summariseRunDistance((await this.movement.getRun(id)).legs));
  }

  /**
   * DA DI vs DU DINH — `#276` L6.
   *
   * Duong `:id/distance` o tren van giu nguyen hinh dang va y nghia cu (mot con so gop). Duong nay
   * la be mat MOI, va no tra loi mot cau khac: bao nhieu km xe DA di, bao nhieu km con la ke hoach,
   * va bao nhieu chang da bi bo. Sua `:id/distance` de tra ca hai se lam moi doc gia dang co doc
   * nham mot con so co y nghia khac.
   */
  @Get(':id/movement')
  @RequiresTransportAction('transport.run.read')
  movementSummary(@Param('id') id: string) {
    return this.guard(async () => summariseRunMovement((await this.movement.getRun(id)).legs));
  }

  /**
   * DOI TRANG THAI MOT CHANG, roi HOI LAI xem vong chay da dong duoc chua.
   *
   * Lan hoi lai la ca diem cua `#276` L4: khong ai bam "dong vong chay". Chang cuoi cung ket thuc
   * LA su kien danh thuc phan xu, va phan xu do tat dinh — no co the tra ve "chua dong duoc" kem
   * ly do, va do la mot ket qua binh thuong chu khong mot loi.
   *
   * Lan quet do KHONG duoc lam hong lan ghi chang: no chay sau, va neu no nem thi chang van da
   * duoc ghi. Nen ket qua cua no di kem trong than tra ve (`closure`) thay vi lam doi ma HTTP.
   */
  @Post(':runId/legs/:legId/transition')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  transitionLeg(
    @Param('runId') runId: string,
    @Param('legId') legId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { to } = this.parse(legTransitionSchema, body);
    return this.guard(async () => {
      await this.requireLegOfRun(runId, legId);
      const leg = await this.movement.transitionLeg(legId, to, transportActorOf(request));
      return { leg, closure: await this.planning.settleRunClosure(runId) };
    });
  }

  @Post(':runId/legs/:legId/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  cancelLeg(
    @Param('runId') runId: string,
    @Param('legId') legId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason } = this.parse(legCancelSchema, body);
    return this.guard(async () => {
      await this.requireLegOfRun(runId, legId);
      const leg = await this.movement.cancelLeg(legId, reason, transportActorOf(request));
      return { leg, closure: await this.planning.settleRunClosure(runId) };
    });
  }

  @Get(':id/assignments')
  @RequiresTransportAction('transport.run.read')
  assignments(@Param('id') id: string) {
    return this.guard(async () => {
      await this.movement.getRun(id);
      return this.movement.runAssignmentHistory(id);
    });
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createRunSchema, body);
    return this.guard(() => this.movement.createRun(input, transportActorOf(request)));
  }

  @Post(':id/legs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  addLeg(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(addLegSchema, body);
    return this.guard(() => this.movement.addLeg(id, input, transportActorOf(request)));
  }

  @Post(':id/assignment')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  assign(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(assignRunSchema, body);
    return this.guard(() => this.movement.assignRun(id, input, transportActorOf(request)));
  }

  @Post(':id/transition')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  transition(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { to } = this.parse(runTransitionSchema, body);
    return this.guard(() => this.movement.transitionRun(id, to, transportActorOf(request)));
  }

  @Post(':id/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { reason } = this.parse(cancelSchema, body);
    return this.guard(() => this.movement.cancelRun(id, reason, transportActorOf(request)));
  }

  /**
   * Chang phai thuoc DUNG vong chay tren duong dan.
   *
   * `MovementService.transitionLeg()` tu doc vong chay cua chang nen no van dung ma khong co phep
   * kiem nay — nhung mot URL noi doi (`runs/A/legs/<chang cua B>`) ma van doi duoc trang thai se
   * lam moi dau vet kiem toan doc theo `runId` bi thieu mot su kien. Chan o day, o dung tang ma
   * `runId` con ton tai.
   */
  private async requireLegOfRun(runId: string, legId: string): Promise<void> {
    const leg = await this.movement.getLeg(legId);
    if (leg.runId !== runId) {
      throw TransportDomainError.notFound(
        'RUN_LEG_NOT_FOUND',
        'Khong tim thay chang do trong vong chay nay.',
      );
    }
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
