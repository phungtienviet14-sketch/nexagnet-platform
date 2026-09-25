import { randomBytes } from 'node:crypto';
import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { buildAccessBreakdown } from './access/access-breakdown.js';
import {
  ESCALATION_VIOLATION,
  accessChangeViolations,
  describeAccountScopes,
  domainReservedUsernames,
  effectivePermissions,
  escalatedPermissions,
  permissionCatalog,
  validateAccess,
} from './access/account-access.js';
import type { AccessViolation, PermissionGrant } from './access/permission-domain.js';
import { PermissionDomainRegistry } from './access/permission-domain.registry.js';
import {
  accessSnapshot,
  accountSnapshot,
  onboardingSnapshot,
  profileSnapshot,
  statusSnapshot,
  toHistoryEntry,
} from './account-audit.js';
import { ACCOUNT_ACCESS_REASONS, ACCOUNT_DECISIONS, type AccountAccessReason } from './account-decisions.js';
import { accountError, accountInputInvalid } from './account-errors.js';
import {
  generateTemporaryPassword,
  isProtectedAccount,
  isReservedUsername,
  isTemporaryPasswordExpired,
  normalizeUsername,
  temporaryPasswordExpiry,
  usernameBase,
  usernameCandidate,
} from './account-policy.js';
import type {
  AccessBreakdown,
  AccountHistoryEntry,
  AccountView,
  AccountWithCredential,
  CurrentAccessResponse,
  PermissionCatalogResponse,
} from './account.types.js';
import { toAccountView, toAuthenticatedUser } from './account-view.js';
import {
  assignRoleSchema,
  changePasswordSchema,
  createUserSchema,
  disableUserSchema,
  enableUserSchema,
  historyQuerySchema,
  listUsersQuerySchema,
  loginSchema,
  resetPasswordSchema,
  setAccessSchema,
  suggestUsernameSchema,
  updateProfileSchema,
  type AssignRoleInput,
  type ChangePasswordInput,
  type CreateUserInput,
  type DisableUserInput,
  type EnableUserInput,
  type HistoryQuery,
  type ListUsersQuery,
  type LoginInput,
  type ResetPasswordInput,
  type SetAccessInput,
  type SuggestUsernameInput,
  type UpdateProfileInput,
} from './auth.schemas.js';
import { USER_ROLES, type AuthenticatedUser, type SessionIdentity, type UserRole } from './auth.types.js';
import { PasswordService } from './password.service.js';
import {
  DuplicateUserError,
  UserRepository,
  isActiveAdmin,
  type AuthUserRecord,
  type GuardedUserChange,
  type UserWrite,
} from './user.repository.js';

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';
const SELF_LOCKOUT_MESSAGE =
  'Không tự khoá, tự đổi quyền hay tự đặt lại mật khẩu của chính mình ở đây — dùng mục Đổi mật khẩu.';
const USERNAME_SUGGESTION_ATTEMPTS = 50;

type AuthActor = Pick<AuthenticatedUser, 'id' | 'username'>;
/** Moi ma TU CHOI cua diem `account.access`. */
type DenialReason = Exclude<AccountAccessReason, 'ACCOUNT_CHANGE_ALLOWED'>;
/** Ten thao tac tren diem quyet dinh `account.access`; `null` = xem truoc, khong ghi quyet dinh. */
type AccountOperation =
  | 'create'
  | 'profile.update'
  | 'access.change'
  | 'disable'
  | 'enable'
  | 'credentials.reset'
  | null;

interface AccessRequest {
  readonly role: UserRole;
  readonly grants: readonly PermissionGrant[];
  readonly confirmEscalation: boolean;
}

/**
 * XAC THUC va QUAN TRI TAI KHOAN cua nen tang.
 *
 * `#395`: moi quy tac quan tri co MA ly do (`account-decisions.ts` / `account-errors.ts`), moi thay
 * doi de lai dong kiem toan co `before` + `after`, va moi quyet dinh `account.access` duoc ghi vao
 * telemetry. Telemetry la TUY CHON va fail-open — thieu no, nghiep vu van dung.
 */
@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;
  private readonly domains: PermissionDomainRegistry;

  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditLogService,
    @Optional() registry?: PermissionDomainRegistry,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {
    this.dummyHash = this.passwords.hash(randomBytes(32).toString('hex'));
    // Khong so dang ky (spec cu dung tay) = khong mien nao: chi quyen nen tang.
    this.domains = registry ?? new PermissionDomainRegistry();
  }

  /* ------------------------------------------------------------------ *
   * XAC THUC
   * ------------------------------------------------------------------ */

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
    // SAU khi mat khau da dung: noi ro mat khau tam het han thay vi "sai mat khau" — nguoi dung
    // can biet phai nho Giam doc cap lai, khong phai go lai.
    if (isTemporaryPasswordExpired(user, loginAt)) throw accountError('TEMPORARY_PASSWORD_EXPIRED');
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

  /**
   * Doc lai tai khoan o MOI yeu cau: vai va quyen rieng doi co hieu luc tu yeu cau KE TIEP (khong
   * can dang nhap lai); khoa / dat lai mat khau doi `credentialVersion` nen phien cu chet (401).
   * Mat khau tam da het han cung lam phien chet — nguoi dung quay ve dang nhap va duoc bao ro.
   */
  async validateSession(identity: SessionIdentity): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(identity.userId);
    if (!user || user.disabledAt || user.credentialVersion !== identity.credentialVersion) {
      return null;
    }
    if (isTemporaryPasswordExpired(user, new Date())) return null;
    return toAuthenticatedUser(user);
  }

  /** `/auth/me`: nguoi dung + tap quyen HIEU LUC (nen tang + moi mien). */
  currentAccess(user: AuthenticatedUser): CurrentAccessResponse {
    return {
      user,
      roles: USER_ROLES,
      permissions: effectivePermissions(this.domains, user),
    };
  }

  async changePassword(actor: AuthActor, input: ChangePasswordInput): Promise<AuthenticatedUser> {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw accountInputInvalid('Yêu cầu đổi mật khẩu không hợp lệ', parsed.error.issues);
    }
    const current = await this.users.findById(actor.id);
    if (
      !current ||
      !(await this.passwords.verify(current.passwordHash, parsed.data.currentPassword))
    ) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    if (isTemporaryPasswordExpired(current, new Date())) {
      throw accountError('TEMPORARY_PASSWORD_EXPIRED');
    }
    const passwordHash = await this.passwords.hash(parsed.data.newPassword);
    const change = requireUpdated(await this.users.updatePassword(actor.id, passwordHash, null));
    await this.audit.append({
      actor: actor.username,
      action: 'auth.credentials.change',
      entityType: 'User',
      entityId: actor.id,
      before: onboardingSnapshot(change.before),
      after: onboardingSnapshot(change.after),
    });
    return toAuthenticatedUser(change.after);
  }

  async recordLogout(actor: AuthActor): Promise<void> {
    await this.audit.append({
      actor: actor.username,
      action: 'auth.logout',
      entityType: 'User',
      entityId: actor.id,
    });
  }

  /* ------------------------------------------------------------------ *
   * DOC cho man hinh quan tri
   * ------------------------------------------------------------------ */

  async listUsers(query: ListUsersQuery = {}): Promise<AccountView[]> {
    const parsed = listUsersQuerySchema.safeParse(query);
    if (!parsed.success) throw accountInputInvalid('Bộ lọc tài khoản không hợp lệ', parsed.error.issues);
    const users = await this.users.list(parsed.data);
    return users.map(toAccountView);
  }

  permissionCatalog(): PermissionCatalogResponse {
    return permissionCatalog(this.domains);
  }

  async accessBreakdown(id: string): Promise<AccessBreakdown> {
    const target = await this.users.findById(id);
    if (!target) throw accountError('ACCOUNT_NOT_FOUND');
    return this.breakdownOf(target);
  }

  async history(id: string, query: HistoryQuery = {}): Promise<AccountHistoryEntry[]> {
    const parsed = historyQuerySchema.safeParse(query);
    if (!parsed.success) throw accountInputInvalid('Tham số lịch sử không hợp lệ', parsed.error.issues);
    if (!(await this.users.findById(id))) throw accountError('ACCOUNT_NOT_FOUND');
    const rows = await this.audit.list({ entityType: 'User', entityId: id, limit: parsed.data.limit });
    return rows.map(toHistoryEntry);
  }

  /** Goi y ten dang nhap tu ten nguoi: bo dau, noi bang dau cham, them hau to khi trung. */
  async suggestUsername(input: SuggestUsernameInput): Promise<{ username: string }> {
    const parsed = suggestUsernameSchema.safeParse(input);
    if (!parsed.success) throw accountInputInvalid('Tên để gợi ý không hợp lệ', parsed.error.issues);
    const base = usernameBase(parsed.data.name, parsed.data.prefix ?? '');
    const reserved = domainReservedUsernames(this.domains);
    for (let attempt = 1; attempt <= USERNAME_SUGGESTION_ATTEMPTS; attempt += 1) {
      const candidate = usernameCandidate(base, attempt);
      if (isReservedUsername(candidate, reserved)) continue;
      if (!(await this.users.findByUsername(candidate))) return { username: candidate };
    }
    return { username: `${base}.${randomBytes(2).toString('hex')}` };
  }

  /* ------------------------------------------------------------------ *
   * GHI — moi quy tac co ma ly do
   * ------------------------------------------------------------------ */

  createUser(actor: AuthActor, input: CreateUserInput): Promise<AccountWithCredential> {
    return this.step('account.create', async () => {
      const parsed = createUserSchema.safeParse(input);
      if (!parsed.success) {
        throw accountInputInvalid('Thông tin người dùng không hợp lệ', parsed.error.issues);
      }
      const data = parsed.data;
      const username = normalizeUsername(data.username);
      if (isReservedUsername(username, domainReservedUsernames(this.domains))) {
        throw this.deny('create', 'USERNAME_RESERVED', {});
      }
      const access: AccessRequest = {
        role: data.role,
        grants: data.grants,
        confirmEscalation: data.confirmEscalation,
      };
      this.assertAccessValid('create', undefined, access, data.role === 'ADMIN');

      const temporaryPassword = data.password ?? generateTemporaryPassword();
      const expiresAt = temporaryPasswordExpiry(new Date());
      let record: AuthUserRecord;
      try {
        record = await this.users.create({
          username,
          name: data.name,
          email: data.email?.toLowerCase() ?? null,
          phone: data.phone ?? null,
          jobTitle: data.jobTitle ?? null,
          passwordHash: await this.passwords.hash(temporaryPassword),
          role: data.role,
          temporaryPasswordExpiresAt: expiresAt,
          grants: data.grants,
          grantedBy: actor.username,
        });
      } catch (error) {
        if (error instanceof DuplicateUserError) {
          throw this.deny('create', 'ACCOUNT_IDENTITY_TAKEN', {});
        }
        throw error;
      }
      await this.audit.append({
        actor: actor.username,
        action: 'auth.user.create',
        entityType: 'User',
        entityId: record.id,
        after: accountSnapshot(record),
      });
      await this.auditEscalation(actor, null, record);
      this.allow('create', record.id);
      return {
        ...toAccountView(record),
        credential: { temporaryPassword, expiresAt: expiresAt.toISOString() },
      };
    });
  }

  async updateProfile(
    actor: AuthActor,
    id: string,
    input: UpdateProfileInput,
  ): Promise<AccountView> {
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw accountInputInvalid('Thông tin tài khoản không hợp lệ', parsed.error.issues);
    }
    const { email, ...rest } = parsed.data;
    let result: UserWrite;
    try {
      result = await this.users.updateProfile(id, {
        ...rest,
        ...(email !== undefined ? { email: email?.toLowerCase() ?? null } : {}),
      });
    } catch (error) {
      if (error instanceof DuplicateUserError) {
        throw this.deny('profile.update', 'ACCOUNT_IDENTITY_TAKEN', { userId: id });
      }
      throw error;
    }
    if (result.status === 'NOT_FOUND') throw this.deny('profile.update', 'ACCOUNT_NOT_FOUND', {});
    await this.audit.append({
      actor: actor.username,
      action: 'auth.user.profile.update',
      entityType: 'User',
      entityId: id,
      before: profileSnapshot(result.before),
      after: profileSnapshot(result.after),
    });
    this.allow('profile.update', id);
    return toAccountView(result.after);
  }

  /**
   * Doi vai + TOAN BO quyen rieng. `dryRun` chay DU moi quy tac (ke ca xem truoc "Giam doc cuoi
   * cung") nhung khong ghi, khong kiem toan, khong ghi quyet dinh — va tra bang "lam duoc gi" cua
   * bo quyen DE XUAT.
   */
  async setAccess(
    actor: AuthActor,
    id: string,
    input: SetAccessInput,
  ): Promise<AccessBreakdown | { account: AccountView; access: AccessBreakdown }> {
    const parsed = setAccessSchema.safeParse(input);
    if (!parsed.success) throw accountInputInvalid('Bộ quyền không hợp lệ', parsed.error.issues);
    const { dryRun, ...access } = parsed.data;
    if (!dryRun) {
      const account = await this.applyAccess(actor, id, access);
      return { account: toAccountView(account), access: await this.breakdownOf(account) };
    }
    const target = await this.checkAccessChange(null, actor, id, access);
    if (access.role !== 'ADMIN' && isActiveAdmin(target) && (await this.users.countActiveAdmins()) <= 1) {
      throw accountError('LAST_ACTIVE_ADMIN');
    }
    return this.breakdownOf(target, access.role, access.grants);
  }

  /** Duong CU `PATCH :id/role`: doi vai va XOA moi quyen rieng — mot giao dich, co kiem toan. */
  async assignRole(actor: AuthActor, id: string, input: AssignRoleInput): Promise<AccountView> {
    const parsed = assignRoleSchema.safeParse(input);
    if (!parsed.success) throw accountInputInvalid('Vai trò không hợp lệ', parsed.error.issues);
    const account = await this.applyAccess(actor, id, {
      role: parsed.data.role,
      grants: [],
      confirmEscalation: parsed.data.confirmEscalation,
    });
    return toAccountView(account);
  }

  async disableUser(actor: AuthActor, id: string, input: DisableUserInput): Promise<AccountView> {
    const parsed = disableUserSchema.safeParse(input);
    if (!parsed.success) {
      throw accountInputInvalid('Phải xác nhận khoá tài khoản', parsed.error.issues);
    }
    return this.step('account.status.change', async () => {
      await this.assertManageable('disable', actor, id);
      const result = this.requireGuarded('disable', id, await this.users.disable(id));
      // Da khoa tu truoc: khong co gi de ghi.
      if (result.before.disabledAt !== null) return toAccountView(result.after);
      await this.audit.append({
        actor: actor.username,
        action: 'auth.user.disable',
        entityType: 'User',
        entityId: id,
        before: statusSnapshot(result.before),
        after: { ...statusSnapshot(result.after), reason: parsed.data.reason ?? null },
      });
      this.allow('disable', id);
      return toAccountView(result.after);
    });
  }

  /**
   * Mo khoa — KHONG doi mat khau. Tai khoan cu bi khoa boi di tru `20260812162000_auth_sessions`
   * (mat khau `!legacy-user-disabled-until-reset!`) can MO KHOA roi CAP MAT KHAU TAM.
   */
  async enableUser(actor: AuthActor, id: string, input: EnableUserInput): Promise<AccountView> {
    const parsed = enableUserSchema.safeParse(input);
    if (!parsed.success) {
      throw accountInputInvalid('Phải xác nhận mở khoá tài khoản', parsed.error.issues);
    }
    return this.step('account.status.change', async () => {
      const result = await this.users.enable(id);
      if (result.status === 'NOT_FOUND') throw this.deny('enable', 'ACCOUNT_NOT_FOUND', {});
      if (result.before.disabledAt === null) return toAccountView(result.after);
      await this.audit.append({
        actor: actor.username,
        action: 'auth.user.enable',
        entityType: 'User',
        entityId: id,
        before: statusSnapshot(result.before),
        after: statusSnapshot(result.after),
      });
      this.allow('enable', id);
      return toAccountView(result.after);
    });
  }

  /**
   * Cap MAT KHAU TAM moi (72 gio, phai doi o lan dang nhap ke tiep). Phien cu chet (`credentialVersion`).
   * KHONG mo khoa: tai khoan dang khoa van khoa.
   */
  resetPassword(
    actor: AuthActor,
    id: string,
    input: ResetPasswordInput,
  ): Promise<AccountWithCredential> {
    return this.step('account.credentials.reset', async () => {
      const parsed = resetPasswordSchema.safeParse(input ?? {});
      if (!parsed.success) {
        throw accountInputInvalid('Mật khẩu mới không hợp lệ', parsed.error.issues);
      }
      await this.assertManageable('credentials.reset', actor, id);
      const temporaryPassword = parsed.data.password ?? generateTemporaryPassword();
      const expiresAt = temporaryPasswordExpiry(new Date());
      const passwordHash = await this.passwords.hash(temporaryPassword);
      const result = await this.users.updatePassword(id, passwordHash, expiresAt);
      if (result.status === 'NOT_FOUND') {
        throw this.deny('credentials.reset', 'ACCOUNT_NOT_FOUND', {});
      }
      await this.audit.append({
        actor: actor.username,
        action: 'auth.credentials.reset',
        entityType: 'User',
        entityId: id,
        before: onboardingSnapshot(result.before),
        after: onboardingSnapshot(result.after),
      });
      this.allow('credentials.reset', id);
      return {
        ...toAccountView(result.after),
        credential: { temporaryPassword, expiresAt: expiresAt.toISOString() },
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * NOI BO
   * ------------------------------------------------------------------ */

  private applyAccess(actor: AuthActor, id: string, access: AccessRequest): Promise<AuthUserRecord> {
    return this.step('account.access.change', async () => {
      await this.checkAccessChange('access.change', actor, id, access);
      const result = this.requireGuarded(
        'access.change',
        id,
        await this.users.setAccess(id, { ...access, grantedBy: actor.username }),
      );
      await this.audit.append({
        actor: actor.username,
        action: 'auth.user.access.change',
        entityType: 'User',
        entityId: id,
        before: accessSnapshot(result.before),
        after: accessSnapshot(result.after),
      });
      await this.auditEscalation(actor, result.before, result.after);
      this.allow('access.change', id);
      return result.after;
    });
  }

  /**
   * Moi quy tac cua mot lan doi quyen, THEO THU TU: tu minh → ton tai → tai khoan he thong → bo
   * quyen hop le (mien + leo thang) → lien ket cua mien. "Giam doc cuoi cung" kiem trong kho, duoi
   * khoa. Tra ban ghi hien tai.
   */
  private async checkAccessChange(
    operation: AccountOperation,
    actor: AuthActor,
    id: string,
    access: AccessRequest,
  ): Promise<AuthUserRecord> {
    const target = await this.assertManageable(operation, actor, id);
    this.assertAccessValid(
      operation,
      id,
      access,
      access.role === 'ADMIN' && target.role !== 'ADMIN',
    );
    const links = await accessChangeViolations(this.domains, {
      userId: id,
      fromRole: target.role,
      toRole: access.role,
    });
    if (links.length > 0) {
      throw this.deny(operation, linkReason(links), { userId: id, violations: codesOf(links) }, {
        detail: { violations: links },
      });
    }
    return target;
  }

  /** Tu minh, ton tai, tai khoan he thong — chung cho khoa / doi quyen / dat lai mat khau. */
  private async assertManageable(
    operation: AccountOperation,
    actor: AuthActor,
    id: string,
  ): Promise<AuthUserRecord> {
    if (actor.id === id) {
      throw this.deny(operation, 'SELF_LOCKOUT', { userId: id }, { message: SELF_LOCKOUT_MESSAGE });
    }
    const target = await this.users.findById(id);
    if (!target) throw this.deny(operation, 'ACCOUNT_NOT_FOUND', {});
    if (isProtectedAccount(target.username)) {
      throw this.deny(operation, 'PROTECTED_SERVICE_ACCOUNT', { userId: id });
    }
    return target;
  }

  private assertAccessValid(
    operation: AccountOperation,
    userId: string | undefined,
    access: AccessRequest,
    promotesToAdmin: boolean,
  ): void {
    const violations = validateAccess(this.domains, { ...access, promotesToAdmin });
    if (violations.length === 0) return;
    const reason = violations.every((violation) => violation.code === ESCALATION_VIOLATION)
      ? 'ESCALATION_CONFIRMATION_REQUIRED'
      : 'ACCESS_INVALID';
    throw this.deny(
      operation,
      reason,
      { ...(userId ? { userId } : {}), role: access.role, violations: codesOf(violations) },
      { detail: { violations } },
    );
  }

  private requireGuarded(
    operation: AccountOperation,
    id: string,
    result: GuardedUserChange,
  ): Extract<GuardedUserChange, { status: 'UPDATED' }> {
    if (result.status === 'NOT_FOUND') throw this.deny(operation, 'ACCOUNT_NOT_FOUND', {});
    if (result.status === 'LAST_ACTIVE_ADMIN') {
      throw this.deny(operation, 'LAST_ACTIVE_ADMIN', { userId: id });
    }
    return result;
  }

  /**
   * Dong `auth.user.access.escalate` khi lan ghi DUA len vai Giam doc hoac THEM mot quyen nhay cam
   * chua co truoc do — ten tung ma, de so kiem toan tra loi "ai cap quyen nay, khi nao".
   */
  private async auditEscalation(
    actor: AuthActor,
    before: AuthUserRecord | null,
    after: AuthUserRecord,
  ): Promise<void> {
    const promotedToAdmin = after.role === 'ADMIN' && before?.role !== 'ADMIN';
    const previously = new Set(
      before ? escalatedPermissions(this.domains, before.role, before.permissionGrants ?? []) : [],
    );
    const escalated = escalatedPermissions(
      this.domains,
      after.role,
      after.permissionGrants ?? [],
    ).filter((permission) => !previously.has(permission));
    if (!promotedToAdmin && escalated.length === 0) return;
    await this.audit.append({
      actor: actor.username,
      action: 'auth.user.access.escalate',
      entityType: 'User',
      entityId: after.id,
      before: before ? accessSnapshot(before) : null,
      after: { ...accessSnapshot(after), promotedToAdmin, escalatedPermissions: escalated },
    });
  }

  private async breakdownOf(
    account: AuthUserRecord,
    role?: UserRole,
    grants?: readonly PermissionGrant[],
  ): Promise<AccessBreakdown> {
    return buildAccessBreakdown({
      account: toAccountView(account),
      domains: this.domains.all(),
      scopes: await describeAccountScopes(this.domains, account.id),
      ...(role ? { role } : {}),
      ...(grants ? { grants } : {}),
    });
  }

  /** Ghi quyet dinh TU CHOI (tru khi xem truoc) va tra ngoai le co than loi dung ma. */
  private deny(
    operation: AccountOperation,
    reason: DenialReason,
    detail: Readonly<Record<string, unknown>>,
    options: { readonly message?: string; readonly detail?: Readonly<Record<string, unknown>> } = {},
  ): Error {
    if (operation) this.decide('denied', reason, { operation, ...detail });
    return accountError(reason, options);
  }

  private allow(operation: Exclude<AccountOperation, null>, userId: string): void {
    this.decide('allowed', 'ACCOUNT_CHANGE_ALLOWED', { operation, userId });
  }

  private decide(
    outcome: 'allowed' | 'denied',
    reason: AccountAccessReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: ACCOUNT_DECISIONS,
      point: 'account.access',
      outcome,
      reason,
      detail,
    });
  }

  private step<T>(name: string, run: () => Promise<T>): Promise<T> {
    return this.telemetry ? this.telemetry.step(name, run) : run();
  }
}

function requireUpdated(result: UserWrite): Extract<UserWrite, { status: 'UPDATED' }> {
  if (result.status === 'NOT_FOUND') throw accountError('ACCOUNT_NOT_FOUND');
  return result;
}

function codesOf(violations: readonly AccessViolation[]): string[] {
  return [...new Set(violations.map((violation) => violation.code))];
}

/**
 * Ly do cua mot vi pham LIEN KET tu mien: dung ma cua mien khi no la mot ma tai khoan co kieu (vd
 * `ACCOUNT_LINKED_TO_DRIVER`), con lai la `ACCESS_INVALID` kem chi tiet.
 */
function linkReason(violations: readonly AccessViolation[]): DenialReason {
  const codes = codesOf(violations);
  const [only] = codes;
  if (codes.length === 1 && only !== undefined && isDenialReason(only)) return only;
  return 'ACCESS_INVALID';
}

function isDenialReason(code: string): code is DenialReason {
  return code !== 'ACCOUNT_CHANGE_ALLOWED' && (ACCOUNT_ACCESS_REASONS as readonly string[]).includes(code);
}
