import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  groupParticipantUpdateSchema,
  groupParticipantsQuerySchema,
  loadEnv,
  type GroupParticipant,
} from '@ultty/shared';
import { z } from 'zod';
import {
  GroupParticipantNotFoundError,
  GroupParticipantsService,
} from './group-participants.service.js';
import type { GroupParticipantListResult } from './group-participants.repository.js';

const routeIdSchema = z.string().trim().min(1).max(128);
const bulkUpdateSchema = z
  .object({
    participantIds: z.array(routeIdSchema).min(1).max(200),
    changes: groupParticipantUpdateSchema,
    preview: z.boolean(),
    confirmed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.preview && value.confirmed !== true) {
      context.addIssue({ code: 'custom', path: ['confirmed'], message: 'Can xac nhan thay doi hang loat' });
    }
  });

@Controller('groups')
export class GroupParticipantsController {
  private readonly env = loadEnv();

  constructor(private readonly service: GroupParticipantsService) {}

  @Get(':groupId/participants')
  async list(
    @Param('groupId') groupId: string,
    @Query() query: unknown,
  ): Promise<GroupParticipantListResult> {
    const parsedGroupId = routeIdSchema.safeParse(groupId);
    const parsedQuery = groupParticipantsQuerySchema.safeParse(query);
    if (!parsedGroupId.success || !parsedQuery.success) {
      throw new BadRequestException('ID nhom hoac bo loc thanh vien khong hop le');
    }
    return this.service.list(parsedGroupId.data, parsedQuery.data);
  }

  @Patch(':groupId/participants/:participantId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @Param('groupId') groupId: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
  ): Promise<GroupParticipant> {
    this.assertMutationOrigin(origin);
    const parsedGroupId = routeIdSchema.safeParse(groupId);
    const parsedParticipantId = routeIdSchema.safeParse(participantId);
    const parsedBody = groupParticipantUpdateSchema.safeParse(body);
    if (!parsedGroupId.success || !parsedParticipantId.success || !parsedBody.success) {
      throw new BadRequestException('Chi duoc cap nhat rank, vai tro hoac che do xu ly hop le');
    }
    try {
      return await this.service.update(parsedGroupId.data, parsedParticipantId.data, parsedBody.data);
    } catch (error) {
      if (error instanceof GroupParticipantNotFoundError) {
        throw new NotFoundException('Khong tim thay thanh vien trong nhom');
      }
      throw error;
    }
  }

  @Patch(':groupId/participants')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async bulkUpdate(
    @Param('groupId') groupId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedGroupId = routeIdSchema.safeParse(groupId);
    const parsedBody = bulkUpdateSchema.safeParse(body);
    if (!parsedGroupId.success || !parsedBody.success) {
      throw new BadRequestException('Yeu cau cap nhat nhieu thanh vien khong hop le');
    }
    try {
      return await this.service.bulkUpdate(
        parsedGroupId.data,
        [...new Set(parsedBody.data.participantIds)],
        parsedBody.data.changes,
        parsedBody.data.preview,
        parsedBody.data.confirmed ?? false,
      );
    } catch (error) {
      if (error instanceof GroupParticipantNotFoundError) {
        throw new NotFoundException('Co thanh vien khong con ton tai trong nhom');
      }
      throw error;
    }
  }

  private assertMutationOrigin(origin?: string): void {
    if (this.env.NODE_ENV !== 'production') return;
    // Trang /settings nam tren domain OPERATOR (Caddy chan /settings* o domain demo) nen phai
    // chap nhan ca hai origin — giong SettingsController, tranh 403 dung luc sua phan loai.
    const allowed = new Set([this.env.CORS_ORIGIN, this.env.ZALO_OPERATOR_ORIGIN].filter(Boolean));
    if (!origin || !allowed.has(origin)) {
      throw new ForbiddenException('Origin cau hinh thanh vien khong hop le');
    }
  }
}
