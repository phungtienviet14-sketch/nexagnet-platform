import { Controller, Get, Param, Post } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { OrdersService } from './orders.service.js';

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

  @Post(':id/approve')
  approve(@Param('id') id: string): Promise<OrderView> {
    return this.orders.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string): Promise<OrderView> {
    return this.orders.reject(id);
  }

  @Post(':id/sales-handoff/complete')
  completeSalesHandoff(@Param('id') id: string): Promise<OrderView> {
    return this.orders.completeSalesHandoff(id);
  }
}

@Controller('messages')
export class MessagesController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(): Promise<OrderView[]> {
    return this.orders.listMessages();
  }
}
