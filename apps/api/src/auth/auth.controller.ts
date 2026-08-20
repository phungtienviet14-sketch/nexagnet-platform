import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loadFoundationEnv } from '../config/foundation-env.js';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import type { ChangePasswordInput, LoginInput } from './auth.schemas.js';
import { USER_ROLES, type AuthenticatedUser } from './auth.types.js';
import { generateCsrfToken, revokeCsrfToken } from './csrf.guard.js';
import { Public } from './public.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('csrf')
  @Public()
  csrf(@Req() request: AuthenticatedRequest): { csrfToken: string | null } {
    return {
      csrfToken: loadFoundationEnv().AUTH_MODE === 'session' ? generateCsrfToken(request) : null,
    };
  }

  @Get('config')
  @Public()
  config() {
    return { mode: loadFoundationEnv().AUTH_MODE };
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: LoginInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ user: AuthenticatedUser; csrfToken: string }> {
    const user = await this.auth.authenticate(body);
    await regenerateSession(request);
    request.session.user = { userId: user.id, credentialVersion: user.credentialVersion };
    const csrfToken = generateCsrfToken(request, true);
    await saveSession(request);
    return { user, csrfToken };
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return { user: currentUser(request), roles: USER_ROLES };
  }

  @Post('credentials/change')
  async changePassword(
    @Body() body: ChangePasswordInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ user: AuthenticatedUser; csrfToken: string }> {
    const user = await this.auth.changePassword(currentUser(request), body);
    await regenerateSession(request);
    request.session.user = { userId: user.id, credentialVersion: user.credentialVersion };
    const csrfToken = generateCsrfToken(request, true);
    await saveSession(request);
    return { user, csrfToken };
  }

  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const user = currentUser(request);
    await this.auth.recordLogout(user);
    revokeCsrfToken(request);
    await destroySession(request);
    response.clearCookie(loadFoundationEnv().SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}

export function currentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.authUser) throw new UnauthorizedException('Bạn cần đăng nhập');
  return request.authUser;
}

function regenerateSession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}
