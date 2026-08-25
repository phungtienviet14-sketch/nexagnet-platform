import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loadFoundationEnv } from '../config/foundation-env.js';
import type { AuthenticatedRequest } from './session.types.js';
import type { UserRole } from './auth.types.js';
import { ROLES_KEY } from './roles.decorator.js';
import { isInternalServiceRequest } from './internal-service.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;
    const required = this.reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // DA qua xac thuc dich vu-dich vu (`InternalServiceGuard` chay TRUOC guard nay). Mot tien
    // trinh khong co phien, khong co vai tro va khong co trinh duyet — doi no ba thu do nghia la
    // duong noi bo khong bao gio dung duoc o che do `session`.
    if (isInternalServiceRequest(request)) return true;
    const user = request.authUser;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
