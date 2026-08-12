import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '@netviet/shared';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Guard TOAN CUC: moi route can header `x-api-key` khop env.API_KEY.
 *
 * Vi sao can: truoc day API khong co xac thuc nao (0 UseGuards tren 8 controller) va main.ts chi
 * goi enableCors — CORS la co che cua TRINH DUYET, khong chan duoc curl. POST /broadcast gui tin
 * Zalo THAT toi nhieu nhom khach; GET /knowledge tra bang gia + map nhom -> dai ly.
 *
 * HAI CHE DO:
 * - API_KEY BO TRONG (mac dinh) -> guard MO. Giu nguyen demo offline, CI va ban HF Spaces.
 * - API_KEY co gia tri -> chan tat ca tru route gan @Public.
 * NODE_ENV=production BAT BUOC co API_KEY (loadEnv nem loi luc khoi dong) -> khong the deploy ho.
 *
 * GIOI HAN da biet (chua giai quyet o day): app web goi API tu trinh duyet, va EventSource (SSE
 * /events) khong gui duoc header tu chon. Khi bat API_KEY o production, web phai goi qua proxy
 * phia server. KHONG nhan key qua query string (secret khong duoc nam trong URL/log). Xac thuc
 * NGUOI DUNG that la quyet dinh D5, chua lam.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger('ApiKeyGuard');
  private readonly apiKey = loadEnv().API_KEY;
  private readonly authMode = loadEnv().AUTH_MODE;

  constructor(private readonly reflector: Reflector) {
    if (this.authMode === 'none') {
      this.logger.warn(
        'AUTH_MODE=none -> TAT TOAN BO xac thuc API (khong x-api-key, khong kiem Origin). Che do dev/demo; dat lai AUTH_MODE=api-key truoc khi chay du lieu khach that.',
      );
    } else if (!this.apiKey) {
      this.logger.warn(
        'API_KEY chua dat -> API MO cho bat ky ai goi duoc. Chi chap nhan o may local/demo, KHONG dua ra Internet.',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // Session cookie + RBAC do SessionAuthGuard xu ly. Khong bat them API key tren trinh duyet.
    if (this.authMode !== 'api-key') return true;
    if (!this.apiKey) return true; // che do mo (demo/CI)

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    const provided = request?.headers?.['x-api-key'];
    if (typeof provided !== 'string' || !matches(provided, this.apiKey)) {
      // KHONG log key (ke ca ban sai) — tranh ro secret vao log.
      throw new UnauthorizedException('Thieu hoac sai header x-api-key');
    }
    return true;
  }
}

/**
 * So sanh khong ro ri thoi gian. Bam SHA-256 truoc de hai buffer LUON cung do dai —
 * timingSafeEqual nem loi khi do dai khac nhau, va do dai chenh lech tu no da la ro ri thong tin.
 */
function matches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
