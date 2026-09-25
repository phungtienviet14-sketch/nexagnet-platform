import { ApiError } from '../api/errors';
import type { HttpClient } from '../api/http';
import { parseSessionUser, type SessionUser, type StoredSession } from './session-types';

/**
 * LUONG DANG NHAP — thuan, khong phu thuoc nen tang (test tren Node voi `fetch` gia).
 *
 * Buoc 2 (hoi lai `/auth/me` bang CHINH token vua nhan) khong thua. Edge Caddy cua ban trien khai
 * VM hien LOC `Authorization` truoc khi toi API (`deploy/netviet/edge/Caddyfile`). O do mat khau
 * dung, may chu cap token, roi MOI yeu cau sau deu 401 — lai xe se thay "sai mat khau" hoac bi da
 * ra lien tuc ma khong ai hieu vi sao. Hoi lai ngay lap tuc bien tinh huong do thanh MOT thong
 * bao ro rang cho nguoi quan tri, truoc khi co bang chung nao bi xep hang duoi mot phien vo dung.
 */

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

interface NativeSessionBody {
  readonly user?: unknown;
  readonly sessionToken?: unknown;
  readonly idleTimeoutMs?: unknown;
}

export class EdgeFiltersSessionError extends Error {
  constructor() {
    super(
      'Máy chủ đã nhận mật khẩu nhưng cổng mạng phía trước chưa cho phiên của ứng dụng đi qua (tiêu đề Authorization bị lọc). Báo quản trị hệ thống — đây không phải lỗi mật khẩu.',
    );
    this.name = 'EdgeFiltersSessionError';
  }
}

export type HttpFactory = (token: string | null) => HttpClient;

export async function openNativeSession(
  serverUrl: string,
  credentials: Credentials,
  httpFor: HttpFactory,
  now: () => Date = () => new Date(),
): Promise<StoredSession> {
  const anonymous = httpFor(null);
  let body: NativeSessionBody;
  try {
    body = await anonymous.post<NativeSessionBody>(
      '/auth/native/session',
      { username: credentials.username.trim(), password: credentials.password },
      { anonymous: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'NOT_MOUNTED') {
      throw new ApiError(
        'NOT_MOUNTED',
        'Máy chủ này chưa hỗ trợ đăng nhập từ ứng dụng di động. Kiểm tra lại địa chỉ, hoặc báo quản trị cập nhật máy chủ.',
        404,
      );
    }
    throw error;
  }
  const token = typeof body.sessionToken === 'string' ? body.sessionToken : '';
  if (token === '') throw new Error('Máy chủ không trả phiên đăng nhập');
  const issued = parseSessionUser(body.user);

  const verified = await verifySession(httpFor(token)).catch((error: unknown) => {
    if (error instanceof ApiError && error.kind === 'UNAUTHENTICATED') {
      throw new EdgeFiltersSessionError();
    }
    throw error;
  });
  if (verified.id !== issued.id)
    throw new Error('Máy chủ xác nhận nhầm tài khoản — đã huỷ đăng nhập');

  return {
    serverUrl,
    token,
    user: verified,
    idleTimeoutMs: typeof body.idleTimeoutMs === 'number' ? body.idleTimeoutMs : 8 * 60 * 60 * 1000,
    verifiedAt: now().toISOString(),
  };
}

/** Hoi may chu phien con song khong, va vai tro hien tai (co the vua bi doi o van phong). */
export async function verifySession(http: HttpClient): Promise<SessionUser> {
  const body = await http.get<{ user?: unknown }>('/auth/me');
  return parseSessionUser(body?.user);
}

/** Dang xuat: huy phien o MAY CHU truoc. Mat mang thi van xoa o may — phien tu het han sau. */
export async function closeNativeSession(
  http: HttpClient,
): Promise<'SERVER_CLOSED' | 'LOCAL_ONLY'> {
  try {
    await http.post('/auth/logout');
    return 'SERVER_CLOSED';
  } catch {
    return 'LOCAL_ONLY';
  }
}
