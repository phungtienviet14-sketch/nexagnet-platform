import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { GroupMappingService, groupMappingSchema } from './group-mapping.service.js';
import { MasterDataService } from './master-data.service.js';

@Controller('settings/master-data')
export class MasterDataController {
  constructor(
    private readonly masterData: MasterDataService,
    private readonly groupMapping: GroupMappingService,
  ) {}

  /** Session guard protects this read; all authenticated roles may inspect current master data. */
  @Get()
  list() {
    return this.masterData.list();
  }

  @Post('import/preview')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  previewImport(@Body() body: unknown) {
    return this.masterData.previewImport(body);
  }

  @Post('import/apply')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  applyImport(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.masterData.applyImport(
      body,
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }

  @Put('dealers/:id')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  saveDealer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.masterData.saveDealer(
      id,
      body,
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }

  @Delete('dealers/:id')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  disableDealer(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.masterData.disableDealer(
      id,
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }

  @Put('deals/:id')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  saveDeal(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.masterData.saveDeal(
      id,
      body,
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }

  @Delete('deals/:id')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  disableDeal(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.masterData.disableDeal(id, actor(request, fallbackActor), requestId ?? null);
  }

  @Put('groups/:chatId')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  mapGroup(
    @Param('chatId') chatId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const parsedChatId = z.string().trim().min(1).max(128).safeParse(chatId);
    const parsedBody = groupMappingSchema.safeParse(body);
    if (!parsedChatId.success || !parsedBody.success) {
      throw new BadRequestException('Dữ liệu map nhóm không hợp lệ');
    }
    return this.groupMapping.setMapping(
      parsedChatId.data,
      parsedBody.data,
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }

  @Delete('groups/:chatId/mapping')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  unmapGroup(
    @Param('chatId') chatId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') fallbackActor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const parsedChatId = z.string().trim().min(1).max(128).safeParse(chatId);
    if (!parsedChatId.success) throw new BadRequestException('Chat ID nhóm không hợp lệ');
    return this.groupMapping.setMapping(
      parsedChatId.data,
      { dealerId: null },
      actor(request, fallbackActor),
      requestId ?? null,
    );
  }
}

function actor(request: AuthenticatedRequest, fallback: string): string {
  return request.authUser?.username ?? fallback;
}
