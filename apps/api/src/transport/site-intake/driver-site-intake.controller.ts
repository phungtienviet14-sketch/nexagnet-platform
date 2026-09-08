import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
import { confirmSiteIntakeSchema, proposeSiteIntakeSchema } from './site-intake.schemas.js';
import { SiteIntakeService } from './site-intake.service.js';
import type { SiteIntakeProposal, SiteIntakeResult } from './site-intake.types.js';

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
  constructor(private readonly intake: SiteIntakeService) {}

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
      }),
    );
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
