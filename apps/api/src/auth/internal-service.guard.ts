import {
  Injectable,
  Logger,
  UnauthorizedException,
  SetMetadata,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadFoundationEnv } from '../config/foundation-env.js';

/**
 * XAC THUC DICH VU - DICH VU cho cac duong `internal/*`.
 *
 * ---------------------------------------------------------------------------
 * VAN DE NO GIAI, do duoc chu khong suy dien:
 *
 * Ban deploy that chay `AUTH_MODE: ${AUTH_MODE:-session}` (`compose.yaml:186`). O che do do ba
 * guard nguoi-dung deu doi mot thu ma mot TIEN TRINH khong the co:
 *
 *   SessionAuthGuard  doi `request.session.user`  -> worker khong co cookie
 *   RolesGuard        doi `authUser.role`         -> worker khong phai mot nguoi
 *   CsrfGuard         doi token CSRF cho POST     -> worker khong co trinh duyet
 *
 * con `ApiKeyGuard` thi TU RUT LUI (`authMode !== 'api-key'` -> `true`), nen `x-api-key` khong
 * duoc kiem gi ca. Ket qua do duoc bang `sales-handoff-internal-auth.spec.ts` TRUOC ban nay:
 * worker mang dung khoa van an **401**, tuc workflow im lang khong lam gi tren ban deploy that.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `@Public()`:
 *
 * `@Public()` bo QUA xac thuc. `internal/*` khong di qua Caddy la mot lop bao ve tot — va bai
 * `caddy-route-contract.test.mjs` giu no bang mot khang dinh phu dinh — nhung mot lop mang
 * KHONG duoc phep la lop xac thuc DUY NHAT: bat ky container nao trong cung mang khach cung goi
 * duoc `http://api:3001/internal/...`. Nen o day van phai co mot bi mat.
 *
 * ---------------------------------------------------------------------------
 * DUNG `API_KEY` LAM KHOA DICH VU — khong dua them mot bi mat thu hai vao he:
 *
 * `compose.yaml:185` da ghi san y dinh do: "API_KEY van render san cho automation tuong lai,
 * khong dua vao browser". O che do `session` bien nay hien khong ai dung; day chinh la cong dung
 * ma dong chu thich do noi toi.
 *
 * FAIL-CLOSED: `API_KEY` rong o che do `session`/`api-key` -> TU CHOI. Khac han `ApiKeyGuard`
 * (rong = mo, cho demo offline) va do la co y: mot duong ghi trang thai don hang khong duoc phep
 * mo toang chi vi ai do quen dat bien.
 */

/** Khoa metadata danh dau mot route/controller la duong NOI BO dich vu-dich vu. */
export const INTERNAL_SERVICE_KEY = 'netviet:isInternalService';

/**
 * Danh dau mot controller (hoac mot route) chi danh cho tien trinh noi bo.
 *
 * Dat o CAP CONTROLLER, khong rai tung route: mot route noi bo bi quen danh dau se roi vao ba
 * guard nguoi-dung va tra 401 cho worker — hong am tham, dung kieu ban nay sinh ra de xoa bo.
 */
export const InternalService = (): CustomDecorator<string> =>
  SetMetadata(INTERNAL_SERVICE_KEY, true);

/**
 * Dau cua "yeu cau nay DA qua xac thuc dich vu".
 *
 * `Symbol` chu khong phai chuoi co chu y: than yeu cau do nguoi ngoai gui di qua body parser va
 * tro thanh thuoc tinh cua doi tuong; mot khoa chuoi (`req.internalService`) vi the co the bi
 * mao danh o mot ben goi nao do. Mot symbol cuc bo cua module nay thi khong the.
 */
const INTERNAL_MARK = Symbol('netviet.internalService');

type MarkableRequest = Record<PropertyKey, unknown>;

/** Yeu cau nay da qua `InternalServiceGuard` chua. Ba guard nguoi-dung doc ham nay. */
export function isInternalServiceRequest(request: unknown): boolean {
  return (request as MarkableRequest | null)?.[INTERNAL_MARK] === true;
}

@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly logger = new Logger('InternalServiceGuard');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isInternal = this.reflector.getAllAndOverride<boolean>(INTERNAL_SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Khong phai duong noi bo -> khong phai viec cua guard nay. Moi route khac giu nguyen hanh vi.
    if (!isInternal) return true;

    const env = loadFoundationEnv();
    const request = context.switchToHttp().getRequest<MarkableRequest>();

    // `AUTH_MODE=none` = da CHU DONG tat xac thuc (dev/demo) — giong het ba guard kia. Danh dau
    // de CsrfGuard khong chan POST, du o che do nay chinh no cung da tu rut lui.
    if (env.AUTH_MODE === 'none') {
      request[INTERNAL_MARK] = true;
      return true;
    }

    if (!env.API_KEY) {
      // Khong log gia tri nao. Thong bao noi ro cach sua vi day la loi CAU HINH, khong phai loi
      // cua ben goi.
      this.logger.error(
        'API_KEY chua dat -> duong internal/* bi khoa. Worker workflow se khong goi duoc.',
      );
      throw new UnauthorizedException('Duong noi bo chua duoc cau hinh khoa dich vu');
    }

    const provided = (request.headers as Record<string, unknown> | undefined)?.['x-api-key'];
    if (typeof provided !== 'string' || !matches(provided, env.API_KEY)) {
      // KHONG log key (ke ca ban sai) — tranh ro secret vao log.
      throw new UnauthorizedException('Thieu hoac sai khoa dich vu noi bo');
    }

    request[INTERNAL_MARK] = true;
    return true;
  }
}

/**
 * So sanh khong ro ri thoi gian. Bam SHA-256 truoc de hai buffer LUON cung do dai —
 * `timingSafeEqual` nem loi khi do dai khac nhau, va do dai chenh lech tu no da la ro ri thong tin.
 */
function matches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
