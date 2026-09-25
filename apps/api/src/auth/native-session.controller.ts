import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { AuthService } from './auth.service.js';
import type { LoginInput } from './auth.schemas.js';
import type { AuthenticatedUser } from './auth.types.js';
import { CsrfExempt } from './csrf.guard.js';
import { isNativeClientRequest, signSessionToken } from './native-session.js';
import { Public } from './public.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';

export interface NativeSessionResponse {
  readonly user: AuthenticatedUser;
  /** Gia tri cookie phien da ky — ung dung gui lai dang `Authorization: Bearer <sessionToken>`. */
  readonly sessionToken: string;
  /** Han TRUOT: phien het neu khong co yeu cau nao trong khoang nay (`SESSION_MAX_AGE_MS`). */
  readonly idleTimeoutMs: number;
}

/**
 * CAP PHIEN CHO UNG DUNG NATIVE — doi MAT KHAU lay token, va CHI mat khau (#394).
 *
 * Cung `AuthService.authenticate()` (cung thong bao loi chung, cung bam gia chong do thoi gian,
 * cung audit `auth.login`), cung `regenerate()` nhu `POST /auth/login`. Khac duy nhat: phien moi
 * duoc tra ve dang TOKEN trong than phan hoi thay vi `Set-Cookie` (da bi chan boi
 * `nativeSessionCarrier`).
 *
 * `@CsrfExempt` an toan vi route doi tieu de `X-Nexagnet-Client`: mot trang web la khong gui
 * duoc tieu de tu dat ma khong qua preflight CORS, nen khong the ep trinh duyet nan nhan dang nhap
 * vao tai khoan cua ke tan cong (login CSRF). Va vi yeu cau native bi bo cookie, phien cookie dang
 * co cua trinh duyet KHONG BAO GIO doi duoc thanh token o day.
 */
@Controller('auth/native')
export class NativeSessionController {
  constructor(private readonly auth: AuthService) {}

  @Post('session')
  @Public()
  @CsrfExempt()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async open(
    @Body() body: LoginInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<NativeSessionResponse> {
    const env = loadFoundationEnv();
    if (env.AUTH_MODE !== 'session' || !env.SESSION_SECRET) {
      throw new NotFoundException('Máy chủ này không dùng đăng nhập theo phiên');
    }
    if (!isNativeClientRequest(request)) {
      throw new BadRequestException('Chỉ ứng dụng di động được mở phiên bằng đường này');
    }
    const user = await this.auth.authenticate(body);
    await regenerateSession(request);
    request.session.user = { userId: user.id, credentialVersion: user.credentialVersion };
    await saveSession(request);
    return {
      user,
      sessionToken: signSessionToken(request.sessionID, env.SESSION_SECRET),
      idleTimeoutMs: env.SESSION_MAX_AGE_MS,
    };
  }
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
