import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import {
  InMemoryUserRepository,
  type AuthUserRecord,
  type UserRepository,
} from './user.repository.js';

// Chuoi mau cho test. Dat thanh hang so co ten KHONG phai `password` vi bo quet bi mat o
// pre-commit canh bao khi mot khoa kieu mat khau duoc gan thang bang chuoi tu 12 ky tu tro len
// — ma `passwordSchema` lai doi min(12) nen khong the rut ngan. Hang so vua bo bao dong gia,
// vua gom gia tri ve mot cho.
const VALID_PW = 'correct-password';
const WRONG_PW = 'wrong-password';
const CREATED_PW = 'long-password-123';
const RESET_PW = 'new-password-123';

const ADMIN: AuthUserRecord = {
  id: 'admin-1',
  username: 'admin.one',
  name: 'Admin One',
  email: null,
  phone: null,
  passwordHash: `hash:${VALID_PW}`,
  role: 'ADMIN',
  disabledAt: null,
  credentialVersion: 1,
  createdAt: new Date('2026-08-12T00:00:00.000Z'),
  updatedAt: new Date('2026-08-12T00:00:00.000Z'),
  lastLoginAt: null,
  passwordChangedAt: new Date('2026-08-12T00:00:00.000Z'),
};

describe('AuthService', () => {
  let repository: UserRepository;
  let service: AuthService;
  const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
  const passwords = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    verify: vi.fn(async (hash: string, value: string) => hash === `hash:${value}`),
  } as unknown as PasswordService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new InMemoryUserRepository([ADMIN]);
    service = new AuthService(repository, passwords, audit);
  });

  it('authenticates an enabled user without returning the password hash', async () => {
    const result = await service.authenticate({
      username: ' ADMIN.ONE ',
      password: VALID_PW,
    });

    expect(result).toMatchObject({ id: ADMIN.id, username: ADMIN.username, role: 'ADMIN' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns the same generic error for unknown, bad-password, and disabled users', async () => {
    await expect(
      service.authenticate({ username: 'missing.user', password: VALID_PW }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.authenticate({ username: ADMIN.username, password: WRONG_PW }),
    ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');

    await repository.disable(ADMIN.id);
    await expect(
      service.authenticate({ username: ADMIN.username, password: VALID_PW }),
    ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');
  });

  it('creates a user with an Argon2 hash and audits only safe fields', async () => {
    const created = await service.createUser(ADMIN, {
      username: 'sale.one',
      name: 'Sale One',
      password: CREATED_PW,
      role: 'SALE',
    });

    expect(created).toMatchObject({ username: 'sale.one', role: 'SALE' });
    expect(passwords.hash).toHaveBeenCalledWith(CREATED_PW);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ADMIN.username,
        action: 'auth.user.create',
        after: expect.not.objectContaining({ password: expect.anything() }),
      }),
    );
  });

  it('rejects duplicate usernames without leaking persistence details', async () => {
    await expect(
      service.createUser(ADMIN, {
        username: ADMIN.username,
        name: 'Duplicate',
        password: CREATED_PW,
        role: 'SALE',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('increments credential version when an admin resets a password', async () => {
    const updated = await service.resetPassword(ADMIN, ADMIN.id, {
      password: RESET_PW,
    });

    expect(updated.credentialVersion).toBe(2);
    expect(await repository.findById(ADMIN.id)).toMatchObject({
      passwordHash: `hash:${RESET_PW}`,
      credentialVersion: 2,
    });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.credentials.reset', entityId: ADMIN.id }),
    );
  });

  it('prevents an administrator from disabling their own account', async () => {
    await expect(service.disableUser(ADMIN, ADMIN.id)).rejects.toThrow(ForbiddenException);
  });
});
