import type { ApiError } from './errors';
import { classifyHttpError, networkError, timeoutError } from './errors';

/**
 * MAY KHACH HTTP DUY NHAT cua ung dung — HAI cach mang phien, chon theo nen tang.
 *
 * `bearer` (Android/iOS) — hop dong voi `apps/api/src/auth/native-session.ts`:
 *   · MOI yeu cau mang `X-Nexagnet-Client` — may chu phuc vu yeu cau native KHONG cookie, nen kho
 *     cookie cua he dieu hanh khong bao gio giu ban sao thu hai cua phien;
 *   · phien di trong `Authorization: Bearer`, khong bao gio trong URL (URL vao log/proxy);
 *   · `credentials: 'omit'`.
 *
 * `cookie` (PWA, CUNG origin voi API) — dung mo hinh bao mat cua web hien tai:
 *   · cookie phien HttpOnly do trinh duyet giu: JS cua trang KHONG BAO GIO cham duoc bi mat phien
 *     (mot token trong localStorage thi lo XSS nao cung doc duoc);
 *   · moi yeu cau ghi mang `x-csrf-token`; KHONG gui `X-Nexagnet-Client` (gui thi may chu bo cookie);
 *   · token CSRF het han (403 "CSRF token không hợp lệ") -> xin lai va gui lai DUNG MOT lan — no
 *     KHONG duoc roi xuong hang doi nhu mot lan bi tu choi quyen.
 */

export type Query = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface CsrfSource {
  /** Token hien co (xin tu `/auth/csrf` neu chua co). */
  current(): Promise<string | null>;
  /** Bo token cu, xin token moi. */
  refresh(): Promise<string | null>;
}

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly clientTag: string;
  readonly getToken: () => string | null;
  /** Mac dinh `bearer`. */
  readonly mode?: 'bearer' | 'cookie';
  /** Bat buoc o che do `cookie`. */
  readonly csrf?: CsrfSource;
  /** Goi khi may chu tra 401 cho mot yeu cau CO token — phien da het/bi thu hoi. */
  readonly onUnauthenticated?: () => void;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  readonly query?: Query;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Bo token (dung cho chinh buoc dang nhap). */
  readonly anonymous?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
export const NATIVE_CLIENT_HEADER = 'x-nexagnet-client';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Thong bao `CsrfGuard` tra — la dau hieu DUY NHAT phan biet token CSRF het han voi 403 quyen. */
export const CSRF_REJECTED_MESSAGE = 'CSRF token không hợp lệ';

export function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const pairs = Object.entries(query).filter(
    (entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined && entry[1] !== null && entry[1] !== '',
  );
  if (pairs.length === 0) return url;
  const search = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${url}?${search}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: HttpClientConfig) {
    // Goi qua ham bao: `this.fetchImpl(...)` voi `fetch` cua trinh duyet gan `this` = HttpClient va
    // trinh duyet nem "Illegal invocation" — PWA khong goi duoc may chu nao.
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('POST', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('DELETE', path, undefined, options);
  }

  /** Multipart — `FormData` cua React Native nhan `{ uri, name, type }` cho tep tren dia. */
  upload<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('POST', path, form, { timeoutMs: 120_000, ...options });
  }

  get mode(): 'bearer' | 'cookie' {
    return this.config.mode ?? 'bearer';
  }

  /**
   * Tieu de xac thuc cho thanh phan tu tai (vd anh chung tu qua `expo-image`). Che do cookie: trinh
   * duyet tu gui cookie cung origin — khong co gi de them.
   */
  authHeaders(): Record<string, string> {
    if (this.mode === 'cookie') return {};
    const token = this.config.getToken();
    return {
      [NATIVE_CLIENT_HEADER]: this.config.clientTag,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  url(path: string, query?: Query): string {
    return buildUrl(this.config.baseUrl, path, query);
  }

  private async send<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const first = await this.attempt(method, path, body, options, false);
    if (first.ok) return first.value as T;
    const failure = first.error;
    // Che do cookie: token CSRF het han KHONG phai phan quyet — xin lai, gui lai MOT lan.
    if (
      this.mode === 'cookie' &&
      failure.kind === 'FORBIDDEN' &&
      failure.message === CSRF_REJECTED_MESSAGE &&
      !SAFE_METHODS.has(method)
    ) {
      await this.config.csrf?.refresh();
      const second = await this.attempt(method, path, body, options, true);
      if (second.ok) return second.value as T;
      throw second.error;
    }
    throw failure;
  }

  private async headersFor(method: string, body: unknown, options: RequestOptions) {
    const headers: Record<string, string> = { accept: 'application/json' };
    let authenticated = false;
    if (this.mode === 'cookie') {
      if (!SAFE_METHODS.has(method)) {
        const csrf = await this.config.csrf?.current();
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      authenticated = !options.anonymous;
    } else {
      headers[NATIVE_CLIENT_HEADER] = this.config.clientTag;
      const token = options.anonymous ? null : this.config.getToken();
      if (token) {
        headers.authorization = `Bearer ${token}`;
        authenticated = true;
      }
    }
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    return { headers, authenticated, isForm };
  }

  private async attempt(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
    isRetry: boolean,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: ApiError }> {
    const { headers, authenticated, isForm } = await this.headersFor(method, body, options);
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const onOuterAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(buildUrl(this.config.baseUrl, path, options.query), {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        credentials: this.mode === 'cookie' ? 'same-origin' : 'omit',
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) return { ok: false, error: timeoutError(timeoutMs) };
      if (options.signal?.aborted) throw error;
      return { ok: false, error: networkError(error) };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }

    if (response.ok) {
      if (response.status === 204) return { ok: true, value: undefined };
      return { ok: true, value: await readJson(response) };
    }
    const failure: ApiError = classifyHttpError(response.status, await readJson(response));
    if (failure.kind === 'UNAUTHENTICATED' && authenticated && !isRetry) {
      this.config.onUnauthenticated?.();
    }
    return { ok: false, error: failure };
  }
}
