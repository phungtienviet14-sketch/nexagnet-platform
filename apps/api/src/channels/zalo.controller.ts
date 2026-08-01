import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Post,
  Put,
} from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { z } from 'zod';
import { ZaloUserClient, normalizeAllowedGroupIds } from './zalo-user.client.js';

const loginSchema = z.object({ acceptedRisk: z.literal(true) }).strict();
const logoutSchema = z.object({ confirmed: z.literal(true) }).strict();
const allowGroupsSchema = z.object({
  groupIds: z.array(z.string().trim().min(1).max(128)).max(10),
}).strict();

/** Cong van hanh ZCA. Chi duoc gateway operator (Basic Auth + HTTPS) proxy toi. */
@Controller('zalo')
export class ZaloController {
  private readonly env = loadEnv();

  constructor(private readonly client: ZaloUserClient) {}

  @Get('status')
  status() {
    return this.client.status();
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
    return this.client.status();
  }

  @Put('allowed-groups')
  async allowGroups(@Body() body: unknown, @Headers('origin') origin?: string) {
    this.assertMutationOrigin(origin);
    const parsed = allowGroupsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Danh sach chi duoc gom toi da 10 ID nhom hop le');
    }
    await this.client.setAllowedGroupIds(normalizeAllowedGroupIds(parsed.data.groupIds));
    return this.client.status();
  }

  @Post('logout')
  async logout(@Body() body: unknown, @Headers('origin') origin?: string) {
    this.assertMutationOrigin(origin);
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Phai xac nhan truoc khi dang xuat va xoa phien Zalo cuc bo');
    }
    await this.client.logout();
    return this.client.status();
  }

  private assertMutationOrigin(origin?: string): void {
    if (this.env.NODE_ENV !== 'production') return;
    if (!origin || origin !== this.env.ZALO_OPERATOR_ORIGIN) {
      throw new ForbiddenException('Origin van hanh Zalo khong hop le');
    }
  }
}
