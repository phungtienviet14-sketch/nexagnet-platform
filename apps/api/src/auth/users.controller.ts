import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import type {
  AssignRoleInput,
  CreateUserInput,
  ResetPasswordInput,
} from './auth.schemas.js';
import { currentUser } from './auth.controller.js';
import { Roles } from './roles.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';

const idSchema = z.string().trim().min(1).max(128);

@Controller('settings/users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list() {
    return this.auth.listUsers();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() body: CreateUserInput, @Req() request: AuthenticatedRequest) {
    return this.auth.createUser(currentUser(request), body);
  }

  @Patch(':id/role')
  assignRole(
    @Param('id') rawId: string,
    @Body() body: AssignRoleInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.assignRole(currentUser(request), parseId(rawId), body);
  }

  @Post(':id/disable')
  disable(
    @Param('id') rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = z.object({ confirmed: z.literal(true) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Phải xác nhận vô hiệu hóa người dùng');
    return this.auth.disableUser(currentUser(request), parseId(rawId));
  }

  @Post(':id/credentials/reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @Param('id') rawId: string,
    @Body() body: ResetPasswordInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.resetPassword(currentUser(request), parseId(rawId), body);
  }
}

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('ID người dùng không hợp lệ');
  return parsed.data;
}
