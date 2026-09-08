import { Inject, Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { TOLL_PROVIDERS, type TollImportCandidate, type TollProvider } from './toll-provider.port.js';

/**
 * CONG API NHA CUNG CAP — mot cho GIU CHO co that, khong phai mot hien thuc.
 *
 * ===========================================================================
 * VI SAO CONG NAY TON TAI DU KHONG CO ADAPTER NAO:
 *
 * #269 J8: neu khong tim thay tai lieu API cong khai thi *"keep `API` source kind and adapter seam;
 * implement an explicit capability/diagnostic like `API_NOT_PUBLICLY_PROVEN`"*.
 *
 * Va co mot ly do manh hon mot yeu cau: ND 119/2024/ND-CP **Dieu 26 khoan 2** dat mot NGHIA VU
 * len nha cung cap —
 *
 *   "Nha cung cap dich vu thanh toan dien tu giao thong co nghia vu CUNG CAP THONG TIN VE GIAO
 *    DICH qua tai khoan giao thong cho chu phuong tien mo tai khoan giao thong THEO THOA THUAN."
 *
 * Nghia la duong nay khong phai khong ton tai — no ton tai va di qua HOP DONG. B co quyen doi, va
 * co che thi do thoa thuan dinh. Do dung la ly do phan loai cua no la `POSSIBLE BUT NOT PROVEN`
 * chu khong phai `UNKNOWN`, va la ly do cho nay duoc giu san thay vi bi xoa di.
 *
 * ===========================================================================
 * BA DIEU KHONG DUOC LAM O DAY — va chung khong phai loi khuyen, chung la ranh gioi cua lane:
 *
 *   1. KHONG dich nguoc ung dung di dong / web cua hai nha cung cap;
 *   2. KHONG bat token, cookie, hay luu luong; khong goi mot endpoint khong co tai lieu;
 *   3. KHONG tu dong hoa CAPTCHA/OTP/MFA.
 *
 * Va: DANG NHAP DUOC vao mot cong web KHONG phai bang chung co API.
 */

export interface TollApiFetchInput {
  readonly accountNo: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
}

/**
 * Mot adapter API that — CHUA CO cai nao, va se chi co khi mot tai lieu hop dong that duoc ky.
 *
 * Khi ngay do den, adapter phai: dung khoa qua co che bi mat cua nen tang (khong commit, khong
 * log), doc-mot-chieu neu nha cung cap ho tro, phan trang/thu lai co bien, va giu nguyen dau vet
 * nguon y nhu mot lan nhap tep. KHONG hanh dong GHI nao ve phia nha cung cap trong lane nay.
 */
export interface TollApiAdapter {
  readonly provider: TollProvider;
  fetch(input: TollApiFetchInput): Promise<TollImportCandidate>;
}

export const TOLL_API_ADAPTERS = Symbol('TOLL_API_ADAPTERS');

export const TOLL_API_STATUSES = ['NOT_PUBLICLY_PROVEN', 'REGISTERED'] as const;
export type TollApiStatus = (typeof TOLL_API_STATUSES)[number];

export interface TollApiDiagnostic {
  readonly provider: TollProvider;
  readonly status: TollApiStatus;
  /** Duong DOI HOI HOP PHAP, do van ban phap luat dat ra — khong phai mot cach di vong. */
  readonly requestPath: string;
}

/**
 * Duong lien he CHINH THUC cua tung nha cung cap, do o 08/09/2026.
 *
 * Day khong phai "cach lay du lieu"; day la cach HOI XIN mot thoa thuan cung cap du lieu theo
 * D.26 kh.2. Ghi ra day de nguoi van hanh doc duoc no ngay tren chan doan, thay vi di tim.
 */
const REQUEST_PATHS: Readonly<Record<TollProvider, string>> = {
  VETC: 'ND 119/2024 D.26 kh.2 — de nghi thoa thuan cung cap du lieu giao dich qua ho so khach hang doanh nghiep VETC (diem dich vu / cong thong tin khach hang customer.vetc.com.vn)',
  EPASS:
    'ND 119/2024 D.26 kh.2 — de nghi thoa thuan cung cap du lieu giao dich qua kenh khach hang doanh nghiep VDTC/ePass (tong dai 1900 9080, ho so dang ky doanh nghiep)',
  OTHER: 'ND 119/2024 D.26 kh.2 — de nghi thoa thuan cung cap du lieu giao dich voi nha cung cap tuong ung',
};

/**
 * SO DANG KY adapter API. Hom nay no RONG, va do la mot ket qua da do chu khong phai mot thieu sot.
 *
 * Tiem qua `@Optional()`: khong khai gi thi khong co adapter nao, va moi loi goi duong `API` that
 * bai DONG voi `TOLL_API_NOT_PUBLICLY_PROVEN`. Mot cong tra ve rong trong im lang se lam nguoi
 * dung tuong thang nha cung cap khong co giao dich nao trong ky.
 */
@Injectable()
export class TollApiRegistry {
  private readonly byProvider: ReadonlyMap<TollProvider, TollApiAdapter>;

  constructor(@Optional() @Inject(TOLL_API_ADAPTERS) adapters?: readonly TollApiAdapter[]) {
    this.byProvider = new Map((adapters ?? []).map((adapter) => [adapter.provider, adapter]));
  }

  adapterFor(provider: TollProvider): TollApiAdapter | null {
    return this.byProvider.get(provider) ?? null;
  }

  statusFor(provider: TollProvider): TollApiStatus {
    return this.byProvider.has(provider) ? 'REGISTERED' : 'NOT_PUBLICLY_PROVEN';
  }

  /** Chan doan CHO TUNG NHA CUNG CAP — #269 doi bang chung RIENG cho VETC va ePass. */
  diagnostics(): readonly TollApiDiagnostic[] {
    return TOLL_PROVIDERS.map((provider) => ({
      provider,
      status: this.statusFor(provider),
      requestPath: REQUEST_PATHS[provider],
    }));
  }
}
