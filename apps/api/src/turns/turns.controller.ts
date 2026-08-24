import { Controller, Get } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { Roles } from '../auth/roles.decorator.js';
import { TurnRecordsRepository } from './turn-records.repository.js';

/**
 * Feed MOI luot da xu ly (tab "Tin nhắn" cua console).
 *
 * Truoc 24/08/2026 controller nay doc qua `OrdersService.listMessages()` — mot ham chi goi
 * `repo.list()` roi khong loc gi ca. No thuoc `sales-order` chi vi cai lop boc, nen khach khong
 * ban hang khong nhin duoc chinh cac luot cua ho. Duong dan `/messages` GIU NGUYEN.
 */
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('messages')
export class MessagesController {
  constructor(private readonly turns: TurnRecordsRepository) {}

  @Get()
  list(): Promise<OrderView[]> {
    return this.turns.list();
  }
}
