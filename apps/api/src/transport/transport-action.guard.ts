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
import {
  TransportDomainError,
  type TransportErrorKind,
  type TransportErrorReason,
} from './transport.errors.js';

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
      throw new NotFoundException(transportErrorBody(error));
    case 'CONFLICT':
      throw new ConflictException(transportErrorBody(error));
    case 'INVALID':
      throw new BadRequestException(transportErrorBody(error));
    case 'DENIED':
      // 403 chu khong phai 409: day la mot cong tu choi, khong phai mot va cham du lieu.
      throw new ForbiddenException(transportErrorBody(error));
  }
}

/**
 * Ba truong CHUAN cua Nest theo tung loai loi mien.
 *
 * Go tay ra day chu khong de Nest tu sinh, vi truyen mot OBJECT vao `NotFoundException` se lam Nest
 * dung nguyen object do lam than phan hoi — tuc `statusCode` va `error` khong con tu dong xuat hien.
 * Bang nay giu chung nguyen van dung gia tri cu.
 */
const HTTP_SHAPE: Readonly<Record<TransportErrorKind, { status: number; error: string }>> = {
  NOT_FOUND: { status: 404, error: 'Not Found' },
  CONFLICT: { status: 409, error: 'Conflict' },
  INVALID: { status: 400, error: 'Bad Request' },
  DENIED: { status: 403, error: 'Forbidden' },
};

export interface TransportErrorBody {
  readonly statusCode: number;
  readonly message: string;
  readonly error: string;
  /** Ly do CO KIEU cua mien — xem khoi chu thich cua ham. */
  readonly reason: TransportErrorReason;
}

/**
 * THAN LOI tren day — `#168 B7`.
 *
 * Truoc day chi `error.message` di qua bien, nen `reason` CO KIEU cua mien bi bo lai o may chu. Hau
 * qua do duoc: mot ma **403 mang bon nghia khac nhau**, va giao dien khong phan biet noi
 * `FUND_PERIOD_STATUS_RACE` (nguoi dung phai TAI LAI) voi `FUND_PERIOD_OVERLAP` (nguoi dung phai
 * SUA NGAY) — dung cai phan biet ma `costing-errors.ts` duoc viet ra de giu. Man hinh vi vay chi
 * con cach hien nguyen van cau tieng Viet cua may chu.
 *
 * THEM MOT TRUONG, khong doi truong nao: `statusCode`, `message` va `error` giu nguyen ten, nguyen
 * kieu va nguyen gia tri cu, nen moi client dang doc chung khong phai sua mot dong nao.
 *
 * KHONG RO RI: `reason` la mot union DONG cac hang so cua mien (`TransportErrorReason`) — khong
 * phai `error.stack`, khong phai ma loi Prisma/SQL, khong phai doi tuong ngoai le, va khong mang
 * mot manh du lieu nghiep vu nao. Dieu duy nhat no noi la DUONG TU CHOI nao da dong, va do chinh
 * la thu giao dien can de chon cach xu ly.
 */
export function transportErrorBody(error: TransportDomainError): TransportErrorBody {
  const shape = HTTP_SHAPE[error.kind];
  return {
    statusCode: shape.status,
    message: error.message,
    error: shape.error,
    reason: error.reason,
  };
}
