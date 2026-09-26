import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { placeSearchSchema } from '../places/places.schemas.js';
import type { KnownPlace, PlaceSearchResponse } from '../places/place-search.types.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import { SiteIntakeReviewService, type DriverIntakeView } from './site-intake-review.service.js';
import {
  confirmSiteIntakeSchema,
  driverDestinationSchema,
  proposeSiteIntakeSchema,
} from './site-intake.schemas.js';
import { SiteIntakeService } from './site-intake.service.js';
import type { SiteIntakeProposal, SiteIntakeResult } from './site-intake.types.js';

/** Ket qua lai xe chon diem giao — KHONG co ma don, khong vong chay, khong tien (`#398` §5). */
export interface DriverDestinationResponse {
  readonly intake: DriverIntakeView;
  /** `true` khi lenh nay la mot lan GUI LAI — khong ghi gi them. */
  readonly replayed: boolean;
}

/**
 * BE MAT LAI XE cua nhan viec tai dia diem A — `#267` H2/H3/H4/H6.
 *
 * ============================================================================================
 * HAI TUYEN, VA CHUNG PHAI TACH
 * ============================================================================================
 *
 * `POST proposals` DOC. No dung `POST` chu khong `GET` vi than yeu cau mang toa do, va
 * `#267` H7 cung Luu y bao mat cua repo deu cam dua du lieu vi tri cua mot con nguoi vao chuoi
 * truy van — no se nam trong nhat ky may chu, trong `Referer`, va trong lich su trinh duyet.
 * Tuyen nay khong ghi mot hang nao.
 *
 * `POST confirmations` GHI, va no la CAI CHAM ma `#267` noi toi. Gop hai tuyen lam mot (mot
 * `POST` co co `create: true`) se lam ranh gioi giua "de nghi" va "tao" thanh mot nhanh `if` —
 * va mot nhanh `if` thi co ngay bi mot lan sua sau nay dao dieu kien. Tach ra thi tuyen doc KHONG
 * HE CO duong nao dan toi mot lenh ghi.
 *
 * ============================================================================================
 * HAI MA QUYEN, CUNG MOT LY LE
 * ============================================================================================
 *
 * `.propose` la mot phep doc ma man hinh goi lai moi lan lai xe keo de lam moi; `.confirm` tao ra
 * mot vong chay. Mot khach muon cho lai xe XEM de nghi nhung chua muon cho ho tu tao chuyen se
 * can dung su khac biet do.
 */
@Controller('transport/me/site-intake')
@UseGuards(TransportActionGuard)
export class DriverSiteIntakeController {
  constructor(
    private readonly intake: SiteIntakeService,
    private readonly commercial: SiteIntakeCommercialService,
    private readonly reviews: SiteIntakeReviewService,
    private readonly places: SiteIntakePlaceSearchBridge,
  ) {}

  @Post('proposals')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.propose')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  propose(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<SiteIntakeProposal> {
    const authUserId = requireAuthUserId(request);
    const parsed = proposeSiteIntakeSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.intake.propose({
        authUserId,
        ...(parsed.data.latitude === undefined ? {} : { latitude: parsed.data.latitude }),
        ...(parsed.data.longitude === undefined ? {} : { longitude: parsed.data.longitude }),
        ...(parsed.data.accuracyMetres === undefined
          ? {}
          : { accuracyMetres: parsed.data.accuracyMetres }),
        ...(parsed.data.observationId === undefined
          ? {}
          : { observationId: parsed.data.observationId }),
        ...(parsed.data.locationAgeMs === undefined
          ? {}
          : { locationAgeMs: parsed.data.locationAgeMs }),
      }),
    );
  }

  @Post('confirmations')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.confirm')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  confirm(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<SiteIntakeResult> {
    const authUserId = requireAuthUserId(request);
    const parsed = confirmSiteIntakeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.intake.confirm({
        authUserId,
        siteId: parsed.data.siteId,
        clientEventId: parsed.data.clientEventId,
        ...(parsed.data.destinationLabel === undefined
          ? {}
          : { destinationLabel: parsed.data.destinationLabel }),
        ...(parsed.data.latitude === undefined ? {} : { latitude: parsed.data.latitude }),
        ...(parsed.data.longitude === undefined ? {} : { longitude: parsed.data.longitude }),
        ...(parsed.data.accuracyMetres === undefined
          ? {}
          : { accuracyMetres: parsed.data.accuracyMetres }),
        ...(parsed.data.observationId === undefined
          ? {}
          : { observationId: parsed.data.observationId }),
        ...(parsed.data.locationAgeMs === undefined
          ? {}
          : { locationAgeMs: parsed.data.locationAgeMs }),
      }),
    );
  }

  /**
   * `#398`: lan nhan viec cua CHINH MINH tren mot vong chay con mo — man Viec dung no de dua lai
   * buoc "Giao toi dau?" khi lai xe da thoat giua chung. `null` = khong co.
   */
  @Get('open')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.propose')
  async open(@Req() request: AuthenticatedRequest): Promise<{ intake: DriverIntakeView | null }> {
    const authUserId = requireAuthUserId(request);
    return this.guard(async () => ({ intake: await this.reviews.driverOpenIntake(authUserId) }));
  }

  /** `#398`: dia diem giao DA BIET — hang rao dang hoat dong, cung nguon voi man tao don (#379). */
  @Get('destinations')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.propose')
  destinations(): Promise<{ available: true; places: readonly KnownPlace[] }> {
    return this.guard(() => this.commercial.knownDestinations());
  }

  /**
   * `#398`: tim dia diem giao theo chu — `POST` vi chuoi tim co the la dia chi kho cua khach, va
   * `#379` da chot khong dua no vao chuoi truy van. Luon 200; trang thai (tat/ban) nam trong than.
   */
  @Post('destinations/search')
  @HttpCode(200)
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.confirm')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  searchDestinations(@Body() body: unknown): Promise<PlaceSearchResponse> {
    const parsed = placeSearchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(() => this.places.search(parsed.data.query));
  }

  /** `#398`: MOT lan nhan viec cua chinh minh. Cua nguoi khac tra 404 — cung ma voi khong co that. */
  @Get(':intakeId')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.propose')
  async one(
    @Req() request: AuthenticatedRequest,
    @Param('intakeId') intakeId: string,
  ): Promise<DriverIntakeView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.reviews.driverIntake(authUserId, intakeId));
  }

  /**
   * `#398`: "GIAO TOI DAU?" — lai xe chon diem giao cho CHINH lan nhan viec cua minh.
   *
   * Du dieu kien tat dinh thi he thong TU tao don va don nhan dung vong chay + chang cu; chua du thi
   * giu cho van phong bo sung. Lai xe khong thay chu "don" nao: ket qua chi noi "da nhan chuyen".
   * Gui lai CUNG `clientEventId` tra ve dung ket cuc cu.
   */
  @Post(':intakeId/destination')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.confirm')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chooseDestination(
    @Req() request: AuthenticatedRequest,
    @Param('intakeId') intakeId: string,
    @Body() body: unknown,
  ): Promise<DriverDestinationResponse> {
    const authUserId = requireAuthUserId(request);
    const parsed = driverDestinationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(async () => {
      const outcome = await this.commercial.chooseDestinationAsDriver({
        authUserId,
        intakeId,
        clientEventId: parsed.data.clientEventId,
        choice: await this.places.choiceOf(parsed.data.destination),
      });
      return {
        intake: await this.reviews.driverIntake(authUserId, intakeId),
        replayed: outcome.replayed,
      };
    });
  }

  /** Lich su nhan viec CUA CHINH MINH. Danh tinh tu phien, khong tu mot `:driverId` tren duong dan. */
  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.site_intake.propose')
  listOwn(@Req() request: AuthenticatedRequest) {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.intake.listOwn(authUserId));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
