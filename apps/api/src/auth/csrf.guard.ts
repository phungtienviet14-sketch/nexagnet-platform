import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { csrfSync } from 'csrf-sync';
import type { Request, Response } from 'express';

const CSRF_EXEMPT_KEY = 'netviet.auth.csrf-exempt';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrf = csrfSync({
  errorConfig: {
    statusCode: 403,
    message: 'CSRF token không hợp lệ',
    code: 'EBADCSRFTOKEN',
  },
});

export function generateCsrfToken(request: Request, overwrite = false): string {
  return String(csrf.generateToken(request, overwrite));
}
export const revokeCsrfToken = csrf.revokeToken;

export const CsrfExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CSRF_EXEMPT_KEY, true);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
    const isExempt = this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) return true;
    const response = context.switchToHttp().getResponse<Response>();
    return new Promise<boolean>((resolve, reject) => {
      csrf.csrfSynchronisedProtection(request, response, (error?: unknown) => {
        if (error) {
          reject(new ForbiddenException('CSRF token không hợp lệ'));
          return;
        }
        resolve(true);
      });
    });
  }
}
