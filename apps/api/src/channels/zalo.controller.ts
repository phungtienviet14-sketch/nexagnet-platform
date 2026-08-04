import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Optional,
  Post,
  Put,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loadEnv } from '@ultty/shared';
import { z } from 'zod';
import {
  ZaloGroupNotAllowedError,
  ZaloNotConnectedError,
  ZaloUserClient,
  normalizeAllowedGroupIds,
} from './zalo-user.client.js';
import { BotIdentityService } from './bot-identity.service.js';
import { GroupParticipantsService } from '../groups/group-participants.service.js';
import { GroupParticipantGroupNotFoundError } from '../groups/prisma-group-participants.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';

const loginSchema = z.object({ acceptedRisk: z.literal(true) }).strict();
const logoutSchema = z.object({ confirmed: z.literal(true) }).strict();
const allowGroupsSchema = z.object({
  groupIds: z.array(z.string().trim().min(1).max(128)).max(10),
}).strict();
const syncMembersParamsSchema = z.object({ groupId: z.string().trim().min(1).max(128) }).strict();
const syncMembersBodySchema = z.object({}).strict();

/** Cong van hanh ZCA. Chi duoc gateway operator (Basic Auth + HTTPS) proxy toi. */
@Controller('zalo')
export class ZaloController {
  private readonly env = loadEnv();

  constructor(
    private readonly client: ZaloUserClient,
    private readonly botIdentity: BotIdentityService,
    @Optional() private readonly participants?: GroupParticipantsService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  @Get('status')
  status() {
    return { ...this.client.status(), botIdentity: this.botIdentity.status() };
  }

  @Get('qr')
  qr(): { image: string } {
    const image = this.client.qrDataUrl();
    if (!image) throw new NotFoundException('QR chua san sang hoac da het han');
    return { image };
  }

  @Get('groups')
  groups() {
    return this.client.listGroups();
  }

  @Post('login')
  login(@Body() body: unknown, @Headers('origin') origin?: string) {
    this.assertMutationOrigin(origin);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Phai xac nhan rui ro zca-js va dung tai khoan phu truoc khi tao QR');
    }
    this.client.startQrLogin();
    return this.status();
  }

  @Put('allowed-groups')
  async allowGroups(@Body() body: unknown, @Headers('origin') origin?: string) {
    this.assertMutationOrigin(origin);
    const parsed = allowGroupsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Danh sach chi duoc gom toi da 10 ID nhom hop le');
    }
    const before = this.client.status().allowedGroupIds;
    const groupIds = normalizeAllowedGroupIds(parsed.data.groupIds);
    await this.client.setAllowedGroupIds(groupIds);
    await this.audit?.append({
      actor: 'operator',
      action: 'zalo.allowlist.update',
      entityType: 'ZaloRuntime',
      entityId: 'allowed-groups',
      before: { groupIds: before },
      after: { groupIds },
    });
    return this.status();
  }

  @Post('logout')
  async logout(@Body() body: unknown, @Headers('origin') origin?: string) {
    this.assertMutationOrigin(origin);
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Phai xac nhan truoc khi dang xuat va xoa phien Zalo cuc bo');
    }
    await this.client.logout();
    await this.audit?.append({
      actor: 'operator',
      action: 'zalo.logout',
      entityType: 'ZaloRuntime',
      entityId: 'zca',
      after: { state: 'logged_out', credentialsRemoved: true },
    });
    return this.status();
  }

  @Post('groups/:groupId/members/sync')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async syncGroupMembers(
    @Param('groupId') groupId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedParams = syncMembersParamsSchema.safeParse({ groupId });
    const parsedBody = syncMembersBodySchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      throw new BadRequestException('ID nhom hoac body dong bo thanh vien khong hop le');
    }
    if (!this.participants) {
      throw new ServiceUnavailableException('Kho luu thanh vien nhom chua duoc cau hinh');
    }
    try {
      const snapshot = await this.client.fetchGroupMembers(parsedParams.data.groupId);
      return await this.participants.synchronize(snapshot);
    } catch (error) {
      if (error instanceof ZaloGroupNotAllowedError) {
        throw new ForbiddenException('Chi duoc dong bo thanh vien cua nhom trong allowlist');
      }
      if (error instanceof ZaloNotConnectedError) {
        throw new ServiceUnavailableException('Zalo chua dang nhap');
      }
      if (error instanceof GroupParticipantGroupNotFoundError) {
        throw new BadRequestException('Nhom Zalo chua duoc map vao nguon su that');
      }
      throw error;
    }
  }

  private assertMutationOrigin(origin?: string): void {
    // AUTH_MODE=none: da tat xac thuc -> chong CSRF khong con y nghia (khong co phien de muon)
    // va chi lam ket khi mo qua IP/loopback/tunnel. Xem env.ts.
    if (this.env.AUTH_MODE === 'none') return;
    if (this.env.NODE_ENV !== 'production') return;
    if (!origin || origin !== this.env.ZALO_OPERATOR_ORIGIN) {
      throw new ForbiddenException('Origin van hanh Zalo khong hop le');
    }
  }
}
