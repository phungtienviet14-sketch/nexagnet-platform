import { Controller, Get, Param, Post } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { OrdersService } from './orders.service.js';
import { Roles } from '../auth/roles.decorator.js';

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
  approve(@Param('id') id: string): Promise<OrderView> {
    return this.orders.approve(id);
  }

  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Post(':id/reject')
  reject(@Param('id') id: string): Promise<OrderView> {
    return this.orders.reject(id);
  }

  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Post(':id/sales-handoff/complete')
  completeSalesHandoff(@Param('id') id: string): Promise<OrderView> {
    return this.orders.completeSalesHandoff(id);
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
