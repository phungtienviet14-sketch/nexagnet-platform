import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
import type { CorrelatedPosting } from './costing.repository.js';
import { driverSelfExpenseSchema } from './costing.schemas.js';
import { CostingService } from './costing.service.js';

/**
 * BE MAT LAI XE cho KHOAN CHI THUONG — `#168 B3`/`B4`, `GD-23`, VT-083.
 *
 * MOT CONTROLLER RIENG tren tien to `/transport/me`, khong phai mot nhanh `if` trong
 * `TripExpensesController`. Cung cau truc ma `DriverFundSelfController` va `DriverTripsController`
 * da dung, va vi cung ba ly do:
 *
 *   1. khong route nao o day nhan `:driverId` hay mot truong `driverId` trong body — danh tinh CHI
 *      den tu phien (`requireAuthUserId`);
 *   2. `driverSelfExpenseSchema` khong co `fundedBy`, nen be mat nay khong tuyen bo duoc
 *      `COMPANY_DIRECT`. Lai xe ghi tien LAI XE da tieu, khong ghi thay cong ty;
 *   3. pham vi "chuyen cua chinh toi" duoc chot trong `CostingService`
 *      (`requireDriverAssignedToTrip`), khong bang vai `SALE` — hai lai xe khac nhau van cung mot
 *      vai, nen vai khong the la cong.
 *
 * `transport.driver.self.expense.record` chu KHONG `transport.costing.expense.record`: ma van hanh
 * kia ghi duoc cho bat ky chuyen nao va bat ky lai xe nao. Xem khoi chu thich cua no trong
 * `transport-actions.ts`.
 */
@Controller('transport/me')
@UseGuards(TransportActionGuard)
export class DriverExpensesSelfController {
  constructor(private readonly costing: CostingService) {}

  /**
   * DANH MUC NHOM CHI PHI cho o chon tren dien thoai — `#168 B4`.
   *
   * Cung mot danh muc ma `POST /transport/me/expenses` kiem theo, doc tu cung mot cho. Khong co
   * duong nay thi nguoi dung phai GO THU mot ma roi doi may chu tra 400 — va do la cach mot bieu
   * mau day nguoi dung vao viec doan mo.
   *
   * `transport.driver.self.expense.record` chu khong mot ma doc rieng: danh muc nay CHI phuc vu o
   * nhap lieu ngay ben canh, nen ai ghi duoc thi doc duoc, va them mot ma thu ba se lam bang phan
   * quyen dai ra ma khong noi them dieu gi.
   */
  @Get('expense-categories')
  @RequiresTransportAction('transport.driver.self.expense.record')
  categories(): { categories: readonly string[]; unrestricted: boolean } {
    return this.costing.expenseCatalogue();
  }

  @Post('expenses')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.expense.record')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  record(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<CorrelatedPosting> {
    const authUserId = requireAuthUserId(request);
    const input = this.parse(driverSelfExpenseSchema, body);
    return this.guard(() =>
      this.costing.recordSelfTripExpense(authUserId, input, transportActorOf(request)),
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
