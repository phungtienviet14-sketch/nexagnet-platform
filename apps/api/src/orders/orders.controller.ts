import { Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { OrdersService } from './orders.service.js';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';

/** Du cho moi username that; du ngan de mot header bia khong phinh duoc ban ghi nao. */
const MAX_ACTOR_LENGTH = 64;
const SAFE_ACTOR = /^[\w.@-]+$/;

/**
 * NGUOI NAO da bam nut nay.
 *
 * Uu tien phien dang nhap that; `x-actor` chi la duong lui cho ban chay `AUTH_MODE=api_key`
 * (demo/CI) — cung thu tu ma `master-data.controller.ts` dung, de mot ban ghi audit khong doi y
 * nghia tuy theo controller nao viet no. KHONG bao gio de trong: mot thao tac khong co nguoi
 * chiu trach nhiem la mot thao tac khong kiem toan duoc.
 *
 * VI SAO PHAI LOC `x-actor`, khac cac controller cu: gia tri nay nay di vao `TraceAnchors.actor`,
 * ma `TelemetryService.envelope()` dung `traceSnapshot()` THO — neo KHONG di qua
 * `sanitizeAttributes`. Nen mot header do nguoi ngoai dat se duoc chep nguyen van vao **moi** ban
 * ghi cua luot do va nam lai trong vong dem. Chan tai cong vao la cho re nhat: mot username that
 * khong bao gio dai qua 64 ky tu hay chua ky tu la.
 *
 * Duoi `AUTH_MODE=session` nhanh nay khong bao gio chay — `authUser.username` da la danh tinh
 * da xac thuc.
 */
function operatorOf(request: AuthenticatedRequest, fallback: string): string {
  const verified = request.authUser?.username;
  if (verified) return verified;
  const claimed = fallback.trim();
  return claimed.length > 0 && claimed.length <= MAX_ACTOR_LENGTH && SAFE_ACTOR.test(claimed)
    ? claimed
    : 'operator';
}

// Ke toan DOC duoc don (doi soat), nhung duyet/tu choi/hoan tat la thao tac van hanh.
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(): Promise<OrderView[]> {
    return this.orders.listOrders();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<OrderView> {
    return this.orders.getOrThrow(id);
  }

  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
  ): Promise<OrderView> {
    return this.orders.approve(id, operatorOf(request, fallbackActor));
  }

  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
  ): Promise<OrderView> {
    return this.orders.reject(id, operatorOf(request, fallbackActor));
  }

  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Post(':id/sales-handoff/complete')
  completeSalesHandoff(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
  ): Promise<OrderView> {
    return this.orders.completeSalesHandoff(id, operatorOf(request, fallbackActor));
  }
}

@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('messages')
export class MessagesController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(): Promise<OrderView[]> {
    return this.orders.listMessages();
  }
}
