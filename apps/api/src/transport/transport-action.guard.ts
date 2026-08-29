import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isInternalServiceRequest } from '../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { roleCanPerform, type TransportAction } from './transport-actions.js';
import { TransportDomainError } from './transport.errors.js';

export const TRANSPORT_ACTION_KEY = 'netviet.transport.action';

/**
 * Khai HANH DONG MIEN ma mot route doi hoi.
 *
 * Dung KEM `@Roles(...)`, khong thay the no. Hai tang tra loi hai cau hoi khac nhau va se tach ra
 * khi `PG-02` dong:
 *
 *   · `@Roles`  — cong AS-BUILT cua nen tang, va la thu ma `roles-coverage.spec.ts` duyet;
 *   · `@RequiresTransportAction` — cong CUA MIEN, viet bang tu vung se con dung sau khi nen tang co
 *     mo hinh permission that. Luc do bang anh xa trong `transport-actions.ts` bi thay bang mot
 *     lan tra permission, va KHONG route nao phai sua.
 */
export const RequiresTransportAction = (action: TransportAction): MethodDecorator =>
  SetMetadata(TRANSPORT_ACTION_KEY, action);

/**
 * Cong hanh dong cua mien van tai.
 *
 * Dang ky o CAP CONTROLLER (`@UseGuards`), khong phai `APP_GUARD` toan cuc: mot cong chi phuc vu
 * mot mien ma cam vao chuoi guard cua ca ung dung se chay cho ca nhung khach khong bat van tai —
 * va do la cach mot vertical lang le tro thanh nen tang.
 */
@Injectable()
export class TransportActionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Cung dieu kien voi `RolesGuard`: o che do khong-phien thi khong co danh tinh de kiem, va
    // toan bo ung dung von da khong xac thuc. Lech dieu kien voi `RolesGuard` se tao ra mot che do
    // chay ma mot nua so cong mo mot nua dong — trang thai kho suy luan nhat.
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;

    const action = this.reflector.getAllAndOverride<TransportAction | undefined>(
      TRANSPORT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (isInternalServiceRequest(request)) return true;

    const user = request.authUser;
    if (!user || !roleCanPerform(user.role, action)) {
      throw new ForbiddenException(`Ban khong co quyen thuc hien thao tac nay (${action})`);
    }
    return true;
  }
}

/**
 * Danh tinh nguoi dang goi, dung cho be mat lai xe.
 *
 * NEM khi khong co phien thay vi roi ve mot gia tri mac dinh: pham vi "chuyen cua chinh toi" khong
 * co nghia gi neu khong biet "toi" la ai, va mot mac dinh im lang o day se mo toan bo be mat lai
 * xe cho bat ky ai o che do khong-phien.
 */
export function requireAuthUserId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Be mat lai xe doi mot phien dang nhap');
  }
  return id;
}

/**
 * Mot cho DUY NHAT doi loi mien -> ma HTTP.
 *
 * Rai `try/catch` tung route se dan toi cung mot tinh huong nghiep vu tra 404 o route nay va 500 o
 * route kia, tuy ai viet route do va viet luc nao.
 */
export function transportErrorToHttp(error: unknown): never {
  if (!(error instanceof TransportDomainError)) throw error;
  switch (error.kind) {
    case 'NOT_FOUND':
      throw new NotFoundException(error.message);
    case 'CONFLICT':
      throw new ConflictException(error.message);
    case 'INVALID':
      throw new BadRequestException(error.message);
    case 'DENIED':
      // 403 chu khong phai 409: day la mot cong tu choi, khong phai mot va cham du lieu.
      throw new ForbiddenException(error.message);
  }
}
