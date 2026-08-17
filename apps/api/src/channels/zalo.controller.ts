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
import { loadEnv } from '@netviet/shared';
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
import { Roles } from '../auth/roles.decorator.js';
import { GroupIdentityService } from '../groups/group-identity.service.js';

/**
 * Hai xac nhan RIENG BIET truoc khi tao QR, khong gop lam mot vi day la hai rui ro khac nhau:
 *  - `acceptedRisk` (D16): zca-js vi pham ToS Zalo => tai khoan CO THE bi khoa bat ky luc nao;
 *  - `acceptedSecondaryAccount` (D20): tai khoan dung o day phai la tai khoan phu/SIM rieng.
 *    Dang nhap bang tai khoan Sale chinh la mat luon kenh lam viec cua Sale khi Zalo khoa.
 *
 * Day la GHI NHAN co truy vet (audit), KHONG phai cong chan go-live: he thong khong the tu kiem
 * mot so dien thoai co phai SIM rieng hay khong. Nguoi van hanh xac nhan, he thong luu lai ai
 * xac nhan luc nao.
 */
const loginSchema = z
  .object({
    acceptedRisk: z.literal(true),
    acceptedSecondaryAccount: z.literal(true),
  })
  .strict();
const logoutSchema = z.object({ confirmed: z.literal(true) }).strict();
const allowGroupsSchema = z
  .object({
    groupIds: z.array(z.string().trim().min(1).max(128)).max(10),
    links: z
      .array(
        z
          .object({
            currentChatId: z.string().trim().min(1).max(128),
            existingGroupId: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();
const syncMembersParamsSchema = z.object({ groupId: z.string().trim().min(1).max(128) }).strict();
const syncMembersBodySchema = z.object({}).strict();

/** Cong van hanh ZCA. Chi duoc gateway operator (Basic Auth + HTTPS) proxy toi. */
@Roles('MANAGER', 'ADMIN')
@Controller('zalo')
export class ZaloController {
  private readonly env = loadEnv();

  constructor(
    private readonly client: ZaloUserClient,
    private readonly botIdentity: BotIdentityService,
    @Optional() private readonly participants?: GroupParticipantsService,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly groupIdentity?: GroupIdentityService,
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
  async groups() {
    const groups = await this.client.listGroups();
    if (this.env.PERSISTENCE === 'prisma' && !this.groupIdentity) {
      throw new ServiceUnavailableException('Dich vu dinh danh nhom chua san sang');
    }
    return this.groupIdentity ? this.groupIdentity.withLegacyCandidates(groups) : groups;
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Phai xac nhan CA HAI dieu: rui ro ToS zca-js, va dang dung tai khoan phu/SIM rieng',
      );
    }
    // Ghi TRUOC khi tao QR: neu ghi sau va tien trinh chet giua chung thi co phien dang nhap
    // ma khong co dau vet ai cho phep — dung thu can nhat khi tai khoan bi Zalo khoa.
    await this.audit?.append({
      actor,
      action: 'zalo.login.risk_accepted',
      entityType: 'ZaloRuntime',
      entityId: 'zca',
      after: {
        acceptedRisk: parsed.data.acceptedRisk,
        acceptedSecondaryAccount: parsed.data.acceptedSecondaryAccount,
        channelMode: this.env.CHANNEL_MODE,
      },
      requestId,
    });
    this.client.startQrLogin();
    return this.status();
  }

  @Put('allowed-groups')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async allowGroups(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsed = allowGroupsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Danh sach chi duoc gom toi da 10 ID nhom hop le');
    }
    const before = this.client.status().allowedGroupIds;
    const groupIds = normalizeAllowedGroupIds(parsed.data.groupIds);
    if (this.env.PERSISTENCE === 'prisma' && (!this.groupIdentity || !this.audit)) {
      throw new ServiceUnavailableException('Dich vu dinh danh hoac audit nhom chua san sang');
    }
    if (this.groupIdentity) {
      const identities = await this.client.listGroupIdentities(groupIds);
      await this.audit?.append({
        actor,
        action: 'zalo.group_identity.reconcile.requested',
        entityType: 'Group',
        entityId: 'zca-allowlist',
        before: { groupIds: before },
        after: { groupIds, links: parsed.data.links ?? [] },
        requestId,
      });
      // Cach ly truoc khi doi identity: neu reconcile/file write loi thi listener fail-closed,
      // khong tiep tuc xu ly bang routing ID cua tai khoan truoc.
      await this.client.setAllowedGroupIds([]);
      await this.groupIdentity.reconcileAllowedGroups(
        identities,
        groupIds,
        parsed.data.links ?? [],
      );
    }
    await this.client.setAllowedGroupIds(groupIds);
    await this.audit?.append({
      actor,
      action: 'zalo.allowlist.update',
      entityType: 'ZaloRuntime',
      entityId: 'allowed-groups',
      before: { groupIds: before },
      after: { groupIds, links: parsed.data.links ?? [] },
      requestId,
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
      // Bot Platform la cong cu cua he thong, khong phai nguoi can phan loai -> khong dua vao
      // danh sach thanh vien. Tai khoan zca cua chinh minh do ZaloUserClient tu loai.
      const botExternalId = this.botIdentity.status().id;
      const snapshot = await this.client.fetchGroupMembers(
        parsedParams.data.groupId,
        botExternalId ? [botExternalId] : [],
      );
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
    const allowed = new Set(
      [this.env.CORS_ORIGIN, this.env.ZALO_OPERATOR_ORIGIN]
        .filter((url): url is string => Boolean(url))
        .map((url) => url.replace(/\/+$/, '')),
    );
    const normalizedOrigin = origin?.replace(/\/+$/, '');
    if (!normalizedOrigin || !allowed.has(normalizedOrigin)) {
      throw new ForbiddenException('Origin van hanh Zalo khong hop le');
    }
  }
}
