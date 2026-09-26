import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { transportActorOf } from '../transport-actor.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import type { KnownPlace, PlaceSearchResponse } from '../places/place-search.types.js';
import { placeSearchSchema } from '../places/places.schemas.js';
import {
  SiteIntakeCommercialService,
  type CommercialOutcome,
  type ExceptionOutcome,
} from './site-intake-commercial.service.js';
import { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import {
  SiteIntakeReviewService,
  type BindableOrderView,
  type DriverOrderActivityView,
  type OrderIntakeSourceView,
  type SiteIntakeReviewView,
} from './site-intake-review.service.js';
import {
  activityQuerySchema,
  bindExistingOrderSchema,
  officeCompleteSchema,
  reportExceptionSchema,
  reviewListQuerySchema,
} from './site-intake.schemas.js';

/** Ket qua mot lenh van phong: ket cuc + khung nhin DA CAP NHAT cua chinh viec do. */
export interface SiteIntakeCommandResponse<T> {
  readonly outcome: T;
  readonly intake: SiteIntakeReviewView;
}

/**
 * VIEC TAI XE NHAN TRUC TIEP — be mat VAN PHONG (`#398`).
 *
 * ============================================================================================
 * MOT BAN GHI, NHIEU BE MAT — KHONG CO HOP THU THU HAI
 * ============================================================================================
 *
 * Hang "Can xu ly" cua giam doc (qua thap dieu hanh), danh sach cua ke toan (`GET /`), ban tin
 * "Don moi tu tai xe" (`GET activity`) va dong nguon tren chi tiet don (`GET by-order/:orderId`) doc
 * CUNG mot hang `TransportSiteIntakeCommercial`. Ke toan va giam doc khac nhau o QUYEN (ma hanh dong
 * + `@Roles`), khong o ban sao du lieu.
 *
 * ============================================================================================
 * KHONG CO NUT DUYET
 * ============================================================================================
 *
 * Don tu tao binh thuong KHONG doi ai bam gi. Ban tin chi DOC; khong co trang thai "da xem" nao
 * lam cong duyet an. Hai lenh ghi o day chi dung cho ngoai le: bo sung dieu con thieu, hoac bao
 * bat thuong.
 */
@Controller('transport/site-intakes')
@UseGuards(TransportActionGuard)
export class SiteIntakeReviewController {
  constructor(
    private readonly reviews: SiteIntakeReviewService,
    private readonly commercial: SiteIntakeCommercialService,
    private readonly places: SiteIntakePlaceSearchBridge,
  ) {}

  @Get()
  @RequiresTransportAction('transport.site_intake.review.read')
  list(@Query() query: unknown): Promise<readonly SiteIntakeReviewView[]> {
    const parsed = parse(reviewListQuerySchema, query);
    return this.guard(() => this.reviews.list(parsed.status));
  }

  /** "DON MOI TU TAI XE" — ban tin, khong vao hang viec can quyet, khong co nut duyet. */
  @Get('activity')
  @RequiresTransportAction('transport.site_intake.review.read')
  activity(@Query() query: unknown): Promise<readonly DriverOrderActivityView[]> {
    const parsed = parse(activityQuerySchema, query);
    return this.guard(() => this.reviews.activity(parsed.hours));
  }

  /** Nguon cua mot don: "Tao tu xac nhan cua tai xe". 404 khi don khong den tu duong nay. */
  @Get('by-order/:orderId')
  @RequiresTransportAction('transport.site_intake.review.read')
  byOrder(@Param('orderId') orderId: string): Promise<OrderIntakeSourceView> {
    return this.guard(() => this.reviews.sourceOfOrder(orderId));
  }

  /*
   * ============================================================================================
   * CHON DIEM GIAO — HAI NGUON #379, CUNG MA QUYEN VOI LENH `complete`
   * ============================================================================================
   *
   * Van phong bo sung diem giao bang dung hai nguyen lieu ma lai xe dung: dia diem DA BIET (hang rao
   * dang hoat dong) va TIM THEO TEN. Khong co o nhap toa do, khong co chu tu do thanh diem giao.
   *
   * `GET destinations` doc tu `knownDestinations()` — CUNG nguon ma `complete` doi chieu mot
   * `KNOWN_PLACE` (`resolve` doc lai `listKnownPlaces()`), nen danh sach tren man khong the chua mot
   * dia diem ma lenh se tu choi. `POST destinations/search` di qua CUNG cau noi
   * `SiteIntakePlaceSearchBridge` ma `complete` dung de TIM LAI (`choiceOf`) — cung dich vu, cung bo
   * nho dem — nen mot ket qua van phong vua chon khop duoc khi may chu doi chieu.
   *
   * Ca hai khai TRUOC `GET :intakeId`: Express so tuyen theo thu tu khai, va `:intakeId` se nuot chu
   * `destinations`. Quyen: `@Roles('ADMIN', 'ACCOUNTING')` + `.review.complete` — y het `complete`,
   * vi ai khong gui duoc diem giao thi khong co ly do gi de tim no.
   */

  /** Dia diem giao DA BIET — chi DOC, cung nguon doi chieu cua lenh `complete`. */
  @Get('destinations')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.site_intake.review.complete')
  destinations(): Promise<{ available: true; places: readonly KnownPlace[] }> {
    return this.guard(() => this.commercial.knownDestinations());
  }

  /**
   * Tim diem giao theo ten — `POST` vi chuoi tim co the la dia chi kho cua khach (#379 khong dua no
   * vao chuoi truy van). Luon 200; tat/ban nam trong than. `@Throttle` 20/phut/nguoi nhu tuyen cua
   * lai xe: moi lan goi co the thanh mot lan hoi ben thu ba.
   */
  @Post('destinations/search')
  @HttpCode(200)
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.site_intake.review.complete')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  searchDestinations(@Body() body: unknown): Promise<PlaceSearchResponse> {
    const parsed = parse(placeSearchSchema, body);
    return this.guard(() => this.places.search(parsed.query));
  }

  @Get(':intakeId')
  @RequiresTransportAction('transport.site_intake.review.read')
  detail(@Param('intakeId') intakeId: string): Promise<SiteIntakeReviewView> {
    return this.guard(() => this.reviews.detail(intakeId));
  }

  /** Don OPEN chua lap ke hoach — de NGUOI chon mot don co san. Khong xep hang, khong doan. */
  @Get(':intakeId/bindable-orders')
  @RequiresTransportAction('transport.site_intake.review.complete')
  bindable(@Param('intakeId') intakeId: string): Promise<readonly BindableOrderView[]> {
    return this.guard(() => this.reviews.bindableOrders(intakeId));
  }

  /**
   * HOAN THIEN: bo sung dieu con thieu (diem giao, xac nhan noi lay), roi CUNG lenh tao don neu da
   * du. Chua du thi tra ve ly do co ma — khong co don OPEN "cho du".
   */
  @Post(':intakeId/complete')
  @HttpCode(200)
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.site_intake.review.complete')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('intakeId') intakeId: string,
    @Body() body: unknown,
  ): Promise<SiteIntakeCommandResponse<CommercialOutcome>> {
    const actor = transportActorOf(request);
    const parsed = parse(officeCompleteSchema, body);
    const pick = parsed.destination;
    return this.guard(async () => {
      const outcome = await this.commercial.completeAsOffice({
        actor,
        intakeId,
        idempotencyKey: parsed.idempotencyKey,
        // HAM, khong gia tri: dich vu chi tim lai khi that su phai ghi (khong phai lan gui lai).
        ...(pick === undefined ? {} : { choice: () => this.places.choiceOf(pick) }),
        ...(parsed.attestOrigin === undefined ? {} : { attestOrigin: parsed.attestOrigin }),
      });
      return { outcome, intake: await this.reviews.detail(intakeId) };
    });
  }

  /** GAN TAY MOT DON CO SAN — nguoi chon, may chu kiem mot-lan-gan va khong-lap-ke-hoach-o-noi-khac. */
  @Post(':intakeId/bind-order')
  @HttpCode(200)
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.site_intake.review.complete')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  bind(
    @Req() request: AuthenticatedRequest,
    @Param('intakeId') intakeId: string,
    @Body() body: unknown,
  ): Promise<SiteIntakeCommandResponse<CommercialOutcome>> {
    const actor = transportActorOf(request);
    const parsed = parse(bindExistingOrderSchema, body);
    return this.guard(async () => ({
      outcome: await this.commercial.bindExistingOrder({
        actor,
        intakeId,
        orderId: parsed.orderId,
      }),
      intake: await this.reviews.detail(intakeId),
    }));
  }

  /**
   * BAO BAT THUONG / HUY — ly do BAT BUOC; may chu quyet huy den dau theo su that van hanh.
   *
   * Chi `ADMIN`: day la quyet dinh cua sep (ke toan bi cat o `ACCOUNTING_DENIED`).
   */
  @Post(':intakeId/exception')
  @HttpCode(200)
  @Roles('ADMIN')
  @RequiresTransportAction('transport.site_intake.exception')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  exception(
    @Req() request: AuthenticatedRequest,
    @Param('intakeId') intakeId: string,
    @Body() body: unknown,
  ): Promise<SiteIntakeCommandResponse<ExceptionOutcome>> {
    const actor = transportActorOf(request);
    const parsed = parse(reportExceptionSchema, body);
    return this.guard(async () => ({
      outcome: await this.commercial.reportException({
        actor,
        intakeId,
        reason: parsed.reason,
        idempotencyKey: parsed.idempotencyKey,
      }),
      intake: await this.reviews.detail(intakeId),
    }));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
  return parsed.data as z.infer<S>;
}
