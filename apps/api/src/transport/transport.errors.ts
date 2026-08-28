import type { TransportDecisionReason } from './transport-decisions.js';

/**
 * Ly do TU CHOI thuoc tang KIEM DAU VAO — khac han ma quyet dinh nghiep vu.
 *
 * Tach lam hai bo co chu y: ma o `transport-decisions.ts` tra loi "he thong da quyet dinh gi va vi
 * sao" (cai nguoi doc trace can); ma o day tra loi "nguoi goi da dua vao cai gi sai" (cai nguoi
 * dung API can). Tron lai thi bang loc trace se day nhung dong "thieu truong ten" — khong phai
 * quyet dinh nghiep vu nao ca.
 */
export const TRANSPORT_VALIDATION_REASONS = [
  'VEHICLE_NOT_FOUND',
  'VEHICLE_PLATE_TAKEN',
  'DRIVER_NOT_FOUND',
  'CUSTOMER_NOT_FOUND',
  'PARTNER_NOT_FOUND',
  /** Doi tac phai co it nhat mot vai — mot doi tac khong vai khong dung duoc vao viec gi. */
  'PARTNER_ROLES_EMPTY',
  /** Doi tac duoc chi dinh nhung khong mang dung vai can cho vi tri do (VT-054). */
  'PARTNER_ROLE_MISMATCH',
  'TRIP_NOT_FOUND',
  'TRIP_CODE_TAKEN',
  /** Ngay nghiep vu sai dang hoac khong co that. */
  'BUSINESS_DATE_INVALID',
  /** Han GPLX sai dang. */
  'LICENCE_EXPIRY_INVALID',
  /** Tien khong phai so nguyen dong, hoac am o cho khong duoc am. */
  'MONEY_INVALID',
] as const;
export type TransportValidationReason = (typeof TRANSPORT_VALIDATION_REASONS)[number];

export type TransportErrorReason = TransportDecisionReason | TransportValidationReason;

/**
 * Loai loi quyet dinh MA HTTP o controller. Nam o day chu khong o controller vi cung mot tinh
 * huong nghiep vu phai tra cung mot ma du goi tu route nao.
 */
export type TransportErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'DENIED';

/**
 * Loi cua mien van tai.
 *
 * Mang `reason` CO KIEU chu khong chi mot cau tieng Viet: cau chu de nguoi doc, `reason` de may
 * loc — va de bai test khang dinh dung duong tu choi nao da dong, thay vi chi biet "co nem".
 */
export class TransportDomainError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    readonly reason: TransportErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'TransportDomainError';
  }

  static notFound(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('NOT_FOUND', reason, message);
  }

  static conflict(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('CONFLICT', reason, message);
  }

  static invalid(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('INVALID', reason, message);
  }

  static denied(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('DENIED', reason, message);
  }
}
