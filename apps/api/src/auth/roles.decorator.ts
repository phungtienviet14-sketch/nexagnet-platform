import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './auth.types.js';

export const ROLES_KEY = 'netviet.auth.roles';

export const Roles = (...roles: readonly UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
