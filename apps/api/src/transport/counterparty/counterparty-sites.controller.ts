import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { createCounterpartySiteSchema, updateCounterpartySiteSchema } from './site.schemas.js';
import { CounterpartySiteService } from './site.service.js';

/**
 * DIA DIEM VAN HANH qua HTTP — `#267` H1.
 *
 * ============================================================================================
 * VI SAO KHONG CO MA QUYEN RIENG
 * ============================================================================================
 *
 * Duong nay dung `transport.counterparty.read`/`.manage` chu khong them mot cap ma thu ba, va do
 * la mot lua chon chu khong phai mot lan bo quen.
 *
 * Mot ma quyen moi chi dang co khi no cat duoc mot ranh gioi CO THAT — nhu `.review` tach khoi
 * `.submit` o de nghi chi, hay `.reopen` tach khoi `.manage` o ky ke toan. O day khong co ranh
 * gioi nao: nguoi khai ho so mot phap nhan va nguoi khai kho cua phap nhan do la cung mot nguoi,
 * lam cung mot viec, trong cung mot lan nhap lieu. Them mot ma se lam bang phan quyen dai hon ma
 * khong noi them mot dieu gi — va moi ma them vao la mot dong nua phai chep sang ban guong web.
 *
 * Be mat LAI XE khong di qua day. No di qua `transport.driver.self.site_intake.*` cua
 * `transport-site-intake`, va no khong doc duoc danh sach kho — no chi hoi "toi dang o dau".
 */
@Controller('transport/counterparties/:counterpartyId/sites')
@UseGuards(TransportActionGuard)
export class CounterpartySitesController {
  constructor(private readonly sites: CounterpartySiteService) {}

  @Get()
  @RequiresTransportAction('transport.counterparty.read')
  list(@Param('counterpartyId') counterpartyId: string) {
    return this.guard(() => this.sites.list(counterpartyId));
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(
    @Param('counterpartyId') counterpartyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(createCounterpartySiteSchema, body);
    return this.guard(() =>
      this.sites.create(
        counterpartyId,
        {
          name: input.name,
          address: input.address ?? null,
          note: input.note ?? null,
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        transportActorOf(request),
      ),
    );
  }

  /**
   * `:siteId` la khoa DUY NHAT toan he, nen duong sua khong can `:counterpartyId` de tim hang.
   * No van nam duoi tien to do de mot cai cay tuyen doc len van la mot cau — va dich vu doc
   * `site.counterpartyId` tu chinh hang, khong tu duong dan, nen khong co cach nao sua nham hang
   * cua mot phap nhan khac bang cach doi tien to.
   */
  @Patch(':siteId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  update(
    @Param('siteId') siteId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateCounterpartySiteSchema, body);
    return this.guard(() =>
      this.sites.update(
        siteId,
        {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.address === undefined ? {} : { address: patch.address ?? null }),
          ...(patch.note === undefined ? {} : { note: patch.note ?? null }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
        },
        transportActorOf(request),
      ),
    );
  }

  /* --------------------------- Noi bo --------------------------- */

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
