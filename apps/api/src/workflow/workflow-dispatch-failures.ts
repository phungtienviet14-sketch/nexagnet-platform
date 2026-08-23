/**
 * LY DO HONG CO KIEU cho BUOC GUI (Nexagnet -> engine).
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA MOT MODULE RIENG, khong nhap vao `observability/decision-reasons.ts`:
 *
 * File do dang mang thay doi CHUA COMMIT cua mot luong khac (Phase 0). Gop bay gio se keo viec
 * cua ho vao commit nay, va do la cach nhanh nhat de mat no. Gop sach se o phien sau, khi Phase 0
 * da vao — ghi lai o ban giao nhu mot MON NO, khong phai mot quen lang.
 *
 * VI SAO KHONG DUNG LAI `HANDOFF_STEP_FAILURES`:
 *
 * Bo do la cua WORKER (`integration-handoff.steps.ts`) — no mo ta HE NGOAI cu xu ra sao. Bo o
 * day mo ta ENGINE cu xu ra sao voi NGUOI GOI. Hai bien khac nhau, hai tap nguyen nhan khac
 * nhau; gop chung lai se lam nguoi truc dem khong phan biet duoc "he ngoai tu choi don" voi
 * "engine khong nhan duoc lenh".
 *
 * ---------------------------------------------------------------------------
 * `retryable` DI KEM ma khong suy ra o noi goi: no la thuoc tinh cua chinh NGUYEN NHAN. Thu lai
 * mot token sai la lang phi vong lap; khong thu lai mot engine dang khoi dong lai la mat viec.
 */

export const WORKFLOW_DISPATCH_FAILURES = [
  /** Khong noi duoc toi engine: cong dong, engine dang khoi dong lai, mang hong. */
  'ENGINE_UNAVAILABLE',
  /**
   * Het gio SAU khi da gui. Engine CO THE da nhan va da tao run — ta khong biet.
   *
   * Tach rieng khoi `ENGINE_UNAVAILABLE` vi hau qua khac han: thu lai o day CO THE tao run thu
   * hai. Da do duoc dieu do (`workflow-recovery.int.spec.ts`): hai run, hai lan goi he ngoai,
   * MOT ban ghi — vi khoa idempotency chan o dau ben kia, khong phai engine chan.
   */
  'ENGINE_TRIGGER_AMBIGUOUS',
  /** Engine tu choi danh tinh: token sai, het han, sai tenant. KHONG thu lai. */
  'ENGINE_AUTH_REJECTED',
  /**
   * Engine khong biet ten workflow nay — thuong la chua worker nao dang ky phien ban do.
   * Thu lai duoc (worker co the len sau), nhung no la dau hieu VAN HANH chu khong phai loi mang.
   */
  'WORKFLOW_VERSION_UNAVAILABLE',
  /** Con lai. Giu mot o cho "chua phan loai duoc" thay vi ep bua vao mot ma san. */
  'ENGINE_TRIGGER_FAILED',
] as const;

export type WorkflowDispatchFailure = (typeof WORKFLOW_DISPATCH_FAILURES)[number];

/** Nhan tieng Viet cho nguoi doc log/runbook. Tach khoi ma vi ma la thu MAY loc. */
export const WORKFLOW_DISPATCH_FAILURE_LABELS: Record<WorkflowDispatchFailure, string> = {
  ENGINE_UNAVAILABLE: 'Không nối được tới workflow engine',
  ENGINE_TRIGGER_AMBIGUOUS: 'Hết giờ sau khi đã gửi — engine CÓ THỂ đã nhận',
  ENGINE_AUTH_REJECTED: 'Engine từ chối danh tính (token sai hoặc hết hạn)',
  WORKFLOW_VERSION_UNAVAILABLE: 'Engine chưa biết phiên bản khuôn này (chưa worker nào đăng ký)',
  ENGINE_TRIGGER_FAILED: 'Kích hoạt workflow thất bại, chưa phân loại được',
};

export interface ClassifiedDispatchFailure {
  readonly reason: WorkflowDispatchFailure;
  readonly retryable: boolean;
  /** Thong bao goc, da cat ngan. Giu lai vi ma khong bao gio noi het duoc cau chuyen. */
  readonly detail: string;
}

const MAX_DETAIL = 500;

/**
 * Doc mot loi bat ky tu duong goi engine ra thanh MOT MA.
 *
 * Phai doc theo VAN BAN cua loi, va do la mot su that kho chiu can noi thang: SDK khong phoi ra
 * ma loi gRPC duoi dang truong co kieu tren duong nay, nen day la thu tot nhat lam duoc ma khong
 * phai boc them mot lop nua quanh SDK. Cac chuoi duoi day lay tu loi THAT da bat duoc luc chay
 * (`workflow-recovery.int.spec.ts`), khong phai tu tai lieu.
 *
 * Khi khong chac -> `ENGINE_TRIGGER_FAILED` + `retryable: true`. Doan sai theo huong "thu lai"
 * ton mot vong lap; doan sai theo huong "bo" lam MAT mot don.
 */
export function classifyDispatchFailure(error: unknown): ClassifiedDispatchFailure {
  const detail = (error instanceof Error ? error.message : String(error)).slice(0, MAX_DETAIL);
  const haystack = detail.toUpperCase();

  const has = (...needles: string[]): boolean => needles.some((n) => haystack.includes(n));

  if (has('UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID TOKEN', 'UNAUTHORIZED')) {
    return { reason: 'ENGINE_AUTH_REJECTED', retryable: false, detail };
  }
  // Kiem TRUOC `UNAVAILABLE`: mot thong bao "workflow not found" van co the kem tu do.
  if (has('WORKFLOW NOT FOUND', 'COULD NOT FIND WORKFLOW', 'NO WORKFLOW')) {
    return { reason: 'WORKFLOW_VERSION_UNAVAILABLE', retryable: true, detail };
  }
  if (has('DEADLINE_EXCEEDED', 'ETIMEDOUT', 'TIMEOUT')) {
    // CO THE engine da nhan. Nguoi doc log phai thay dieu do trong chinh ma loi.
    return { reason: 'ENGINE_TRIGGER_AMBIGUOUS', retryable: true, detail };
  }
  if (has('UNAVAILABLE', 'ECONNREFUSED', 'ECONNRESET', 'NO CONNECTION ESTABLISHED', 'ENOTFOUND')) {
    return { reason: 'ENGINE_UNAVAILABLE', retryable: true, detail };
  }
  return { reason: 'ENGINE_TRIGGER_FAILED', retryable: true, detail };
}

/**
 * Chuoi ghi vao `WorkflowOutbox.lastError`.
 *
 * MA DUNG DAU, co dau hai cham, roi moi toi van ban. Nho vay mot cau `SELECT` loc duoc theo ma
 * ma khong phai doc tung dong — do la khac biet giua mot cot debug duoc va mot cot chi de nhin.
 */
export function formatDispatchFailure(classified: ClassifiedDispatchFailure): string {
  return `${classified.reason}: ${classified.detail}`;
}
