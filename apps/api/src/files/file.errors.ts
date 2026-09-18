import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { FileDecisionReason } from './file-decisions.js';

/**
 * LOI cua nen tang tep.
 *
 * Cung khuon `TransportDomainError`: mang mot `reason` CO KIEU chu khong chi mot cau tieng Viet —
 * cau chu de nguoi doc, `reason` de may loc, va de bai test khang dinh dung duong tu choi nao da
 * dong thay vi chi biet "co nem".
 *
 * ============================================================================================
 * MOT LOP RIENG, khong dung lai cua van tai
 * ============================================================================================
 *
 * Nen tang tep thuoc `foundation`. Muon `TransportDomainError` se lam mot module moi khach deu nap
 * phu thuoc vao mot mien ma phan lon khach khong bat — va se keo ca union `TransportErrorReason`
 * (gan bon muoi tu vung) vao mot cho khong dung toi mot ma nao trong so do.
 *
 * ============================================================================================
 * 404 KHONG BAO GIO XUAT HIEN CHO MOT MA TEP
 * ============================================================================================
 *
 * `#287` P6: *"unknown/foreign File ID fails closed without useful enumeration"*.
 *
 * Neu ma la tra 404 con ma that-nhung-khong-phai-cua-ban tra 403, thi hai ma HTTP do CHINH LA may
 * do su ton tai: thu lan luot va doc ma tra ve la dem duoc bao nhieu tep co that tren he thong.
 * Nen ca hai deu la `DENIED` -> 403, mang cung mot ly do `FILE_NOT_AVAILABLE_TO_CALLER`.
 *
 * `NOT_FOUND` van con trong kieu vi mot duong khac can no: cac tuyen van hanh nhan mot ma DA DUOC
 * mot cong khac xac nhan (vd dot don byte theo lo). O do khong co gi de dem.
 */
export type FileErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'DENIED';

export class FileDomainError extends Error {
  constructor(
    readonly kind: FileErrorKind,
    readonly reason: FileDecisionReason,
    message: string,
  ) {
    super(message);
    this.name = 'FileDomainError';
  }

  static notFound(reason: FileDecisionReason, message: string): FileDomainError {
    return new FileDomainError('NOT_FOUND', reason, message);
  }

  static conflict(reason: FileDecisionReason, message: string): FileDomainError {
    return new FileDomainError('CONFLICT', reason, message);
  }

  static invalid(reason: FileDecisionReason, message: string): FileDomainError {
    return new FileDomainError('INVALID', reason, message);
  }

  static denied(reason: FileDecisionReason, message: string): FileDomainError {
    return new FileDomainError('DENIED', reason, message);
  }
}

const HTTP_SHAPE: Readonly<Record<FileErrorKind, { status: number; error: string }>> = {
  NOT_FOUND: { status: 404, error: 'Not Found' },
  CONFLICT: { status: 409, error: 'Conflict' },
  INVALID: { status: 400, error: 'Bad Request' },
  DENIED: { status: 403, error: 'Forbidden' },
};

export interface FileErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly reason: FileDecisionReason;
}

/**
 * Ba truong CHUAN cua Nest + `reason`.
 *
 * Go tay ra day chu khong de Nest tu sinh, cung ly do voi `transportErrorBody`: truyen mot OBJECT
 * vao `NotFoundException` lam Nest dung nguyen object do lam than phan hoi, tuc `statusCode` va
 * `error` khong con tu dong xuat hien.
 *
 * KHONG mot truong nao o day mang `storageKey`. `message` la cau da soan san trong mien, khong phai
 * loi cua SDK luu tru — mot loi cua SDK thuong mang ca duong dan va doi khi ca URL co chu ky.
 */
export function fileErrorBody(error: FileDomainError): FileErrorBody {
  const shape = HTTP_SHAPE[error.kind];
  return {
    statusCode: shape.status,
    error: shape.error,
    message: error.message,
    reason: error.reason,
  };
}

export function fileErrorToHttp(error: unknown): never {
  if (!(error instanceof FileDomainError)) throw error;
  switch (error.kind) {
    case 'NOT_FOUND':
      throw new NotFoundException(fileErrorBody(error));
    case 'CONFLICT':
      throw new ConflictException(fileErrorBody(error));
    case 'INVALID':
      throw new BadRequestException(fileErrorBody(error));
    case 'DENIED':
      // 403 chu khong 409: day la mot cong tu choi, khong mot va cham du lieu.
      throw new ForbiddenException(fileErrorBody(error));
  }
}
