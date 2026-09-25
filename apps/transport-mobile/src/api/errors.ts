/**
 * LOI TU MAY CHU, PHAN LOAI THEO VIEC UNG DUNG PHAI LAM — khong theo ma HTTP tran.
 *
 * Ba loai quyet dinh hanh vi cua hang doi ngoai tuyen, nen chung KHONG duoc gop:
 *
 *   · `UNAUTHENTICATED` (401) — het phien/bi thu hoi. Dung hang doi, KHONG danh dau muc nao la
 *     that bai: dang nhap lai thi gui tiep duoc. Coi 401 la tu choi vinh vien = vut bang chung.
 *   · `FORBIDDEN` / `DOMAIN` (403/400/404/409 co `reason`) — may chu da PHAN QUYET. Gui lai y het
 *     van nhan dung cau tra loi do, nen muc do bi gac sang mot ben (BLOCKED) de nguoi xem.
 *   · `NETWORK` / `TIMEOUT` / `SERVER` (5xx, 429) — chua co phan quyet nao. Thu lai sau.
 *
 * Ngoai le co chu dich: 409 `*_REUSED` (dung lai ma su kien cho noi dung KHAC) la tu choi vinh
 * vien — va la dau hieu mot loi phia may khach, khong phai loi mang.
 */
export type ApiErrorKind =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'DOMAIN'
  | 'NOT_MOUNTED'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'NETWORK'
  | 'TIMEOUT';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Gui lai co the cho ket qua khac khong. */
  get isRetryable(): boolean {
    return (
      this.kind === 'NETWORK' ||
      this.kind === 'TIMEOUT' ||
      this.kind === 'SERVER' ||
      this.kind === 'RATE_LIMITED' ||
      this.kind === 'UNAUTHENTICATED'
    );
  }
}

interface ErrorBody {
  readonly message?: unknown;
  readonly reason?: unknown;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (Array.isArray(value)) {
    const joined = value.filter((part) => typeof part === 'string').join('; ');
    return joined === '' ? null : joined;
  }
  return null;
}

/**
 * Doi mot phan hoi KHONG ok thanh `ApiError`. `body` la JSON da doc (hoac `null` neu than khong
 * phai JSON — voi 404 thi do la dau hieu nang luc chua duoc bat tren may chu nay, dung quy uoc cua
 * web `transport-api.ts`).
 */
export function classifyHttpError(status: number, body: unknown): ApiError {
  const parsed = (body && typeof body === 'object' ? body : {}) as ErrorBody;
  const message = textOf(parsed.message) ?? `Máy chủ trả lỗi ${status}`;
  const reason = typeof parsed.reason === 'string' ? parsed.reason : null;

  if (status === 401) return new ApiError('UNAUTHENTICATED', message, status, reason);
  if (status === 403) return new ApiError('FORBIDDEN', message, status, reason);
  if (status === 404 && body === null) {
    return new ApiError(
      'NOT_MOUNTED',
      'Nghiệp vụ vận tải chưa được bật cho doanh nghiệp này.',
      status,
      reason,
    );
  }
  if (status === 429) {
    return new ApiError(
      'RATE_LIMITED',
      'Thao tác quá nhanh — thử lại sau ít phút.',
      status,
      reason,
    );
  }
  if (status >= 500) return new ApiError('SERVER', message, status, reason);
  return new ApiError('DOMAIN', message, status, reason);
}

export function networkError(cause: unknown): ApiError {
  const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
  return new ApiError('NETWORK', `Không kết nối được máy chủ${detail}`, null);
}

export function timeoutError(ms: number): ApiError {
  return new ApiError('TIMEOUT', `Máy chủ không trả lời sau ${Math.round(ms / 1000)} giây`, null);
}

/** Cau hien cho nguoi dung — khong bao gio lo stack hay ma noi bo tran. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Có lỗi không xác định. Thử lại.';
}
