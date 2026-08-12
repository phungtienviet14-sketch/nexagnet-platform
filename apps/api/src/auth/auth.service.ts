import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service.js';
import {
  assignRoleSchema,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  type AssignRoleInput,
  type ChangePasswordInput,
  type CreateUserInput,
  type LoginInput,
  type ResetPasswordInput,
} from './auth.schemas.js';
import type { AuthenticatedUser, SessionIdentity } from './auth.types.js';
import { PasswordService } from './password.service.js';
import {
  DuplicateUserError,
  UserRepository,
  type AuthUserRecord,
} from './user.repository.js';

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';
type AuthActor = Pick<AuthenticatedUser, 'id' | 'username'>;

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditLogService,
  ) {
    this.dummyHash = this.passwords.hash(randomBytes(32).toString('hex'));
  }

  async authenticate(input: LoginInput): Promise<AuthenticatedUser> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new UnauthorizedException(INVALID_CREDENTIALS);
    const username = normalizeUsername(parsed.data.username);
    const user = await this.users.findByUsername(username);
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const isValid = await this.passwords.verify(passwordHash, parsed.data.password);
    if (!user || !isValid || user.disabledAt) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const loginAt = new Date();
    await this.users.markLogin(user.id, loginAt);
    const authenticated = toAuthenticatedUser({ ...user, lastLoginAt: loginAt });
    await this.audit.append({
      actor: authenticated.username,
      action: 'auth.login',
      entityType: 'User',
      entityId: authenticated.id,
    });
    return authenticated;
  }

  async validateSession(identity: SessionIdentity): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(identity.userId);
    if (!user || user.disabledAt || user.credentialVersion !== identity.credentialVersion) {
      return null;
    }
    return toAuthenticatedUser(user);
  }

  async listUsers(): Promise<AuthenticatedUser[]> {
    const users = await this.users.list();
    return users.map(toAuthenticatedUser);
  }

  async createUser(actor: AuthActor, input: CreateUserInput): Promise<AuthenticatedUser> {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Thông tin người dùng không hợp lệ');
    try {
      const record = await this.users.create({
        username: normalizeUsername(parsed.data.username),
        name: parsed.data.name,
        email: parsed.data.email?.toLowerCase() ?? null,
        phone: parsed.data.phone ?? null,
        passwordHash: await this.passwords.hash(parsed.data.password),
        role: parsed.data.role,
      });
      return await this.auditUserChange(actor, 'auth.user.create', record);
    } catch (error) {
      if (error instanceof DuplicateUserError) {
        throw new ConflictException('Tên đăng nhập, email hoặc số điện thoại đã tồn tại');
      }
      throw error;
    }
  }

  async disableUser(actor: AuthActor, id: string): Promise<AuthenticatedUser> {
    if (actor.id === id) throw new ForbiddenException('Không thể tự vô hiệu hóa tài khoản');
    const record = await this.users.disable(id);
    if (!record) throw new NotFoundException('Không tìm thấy người dùng');
    return this.auditUserChange(actor, 'auth.user.disable', record);
  }

  async assignRole(
    actor: AuthActor,
    id: string,
    input: AssignRoleInput,
  ): Promise<AuthenticatedUser> {
    if (actor.id === id) throw new ForbiddenException('Không thể tự thay đổi vai trò');
    const parsed = assignRoleSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Vai trò không hợp lệ');
    const record = await this.users.assignRole(id, parsed.data.role);
    if (!record) throw new NotFoundException('Không tìm thấy người dùng');
    return this.auditUserChange(actor, 'auth.user.role.assign', record);
  }

  async resetPassword(
    actor: AuthActor,
    id: string,
    input: ResetPasswordInput,
  ): Promise<AuthenticatedUser> {
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Mật khẩu mới không hợp lệ');
    const passwordHash = await this.passwords.hash(parsed.data.password);
    const record = await this.users.updatePassword(id, passwordHash);
    if (!record) throw new NotFoundException('Không tìm thấy người dùng');
    return this.auditUserChange(actor, 'auth.credentials.reset', record);
  }

  async changePassword(actor: AuthActor, input: ChangePasswordInput): Promise<AuthenticatedUser> {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Yêu cầu đổi mật khẩu không hợp lệ');
    const current = await this.users.findById(actor.id);
    if (!current || !(await this.passwords.verify(current.passwordHash, parsed.data.currentPassword))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    const passwordHash = await this.passwords.hash(parsed.data.newPassword);
    const record = await this.users.updatePassword(actor.id, passwordHash);
    if (!record) throw new NotFoundException('Không tìm thấy người dùng');
    return this.auditUserChange(actor, 'auth.credentials.change', record);
  }

  async recordLogout(actor: AuthActor): Promise<void> {
    await this.audit.append({
      actor: actor.username,
      action: 'auth.logout',
      entityType: 'User',
      entityId: actor.id,
    });
  }

  private async auditUserChange(
    actor: AuthActor,
    action: string,
    record: AuthUserRecord,
  ): Promise<AuthenticatedUser> {
    const user = toAuthenticatedUser(record);
    await this.audit.append({
      actor: actor.username,
      action,
      entityType: 'User',
      entityId: user.id,
      after: { username: user.username, name: user.name, role: user.role, disabledAt: user.disabledAt },
    });
    return user;
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US');
}

function toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    credentialVersion: user.credentialVersion,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
  };
}
