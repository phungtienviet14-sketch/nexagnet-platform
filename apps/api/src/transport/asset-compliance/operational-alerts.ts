import type { BusinessDate } from '../business-date.js';

/**
 * BANG CANH BAO VAN HANH GOM CHUNG — VT-015/VT-065 ("tong hop chung vao mot man hinh cho giam
 * doc") va yeu cau "consolidated API/read models" cua Issue #88.
 *
 * KHONG PHAI MOT CAPABILITY. T1 §10.1 viet ro: khong tao capability cho `Reporting` — no la read
 * model cua cac capability DA BAT. Nen bang nay song trong `transport-asset-compliance` (nguoi so
 * huu phan lon cac dong: giay to, bao duong, trang thai xe), va hai nguon con lai den qua cong
 * TUY CHON.
 *
 * KHONG CO CAU CHU NAO O DAY. Moi dong mang mot MA (`kind`) va cac con so cua no; cau tieng Viet
 * hien ra man hinh la viec cua tang experience. Nhet cau chu vao day se lam mot nen tang da khach
 * chi noi duoc mot thu tieng, va lam telemetry mang noi dung khong can mang.
 */

export const OPERATIONAL_ALERT_KINDS = [
  'COMPLIANCE_DOCUMENT_EXPIRED',
  'COMPLIANCE_DOCUMENT_EXPIRING',
  'COMPLIANCE_DOCUMENT_MISSING',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_DUE_SOON',
  /** Nguon: `TX-04`. T6 KHONG tinh lai dinh muc — no doc ket luan da co. */
  'FUEL_CONSUMPTION_ABNORMAL',
  /**
   * Nguon: `TX-03`. So du quy AM = lai xe da chi vuot so duoc ung, dang cho cong ty hoan lai
   * (`DA-T3-01`) — KHONG phai "lai xe dang no", va tuyet doi khong phai mot khoan tru luong
   * (`GD-12`). Ma nay noi "co mot so du can nguoi nhin", khong noi ai no ai.
   */
  'DRIVER_FUND_BALANCE_UNUSUAL',
  /** Acceptance 9 — xe vua dang sua vua dang chay chuyen. */
  'VEHICLE_STATE_INCONSISTENT',
] as const;
export type OperationalAlertKind = (typeof OPERATIONAL_ALERT_KINDS)[number];

export const OPERATIONAL_ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type OperationalAlertSeverity = (typeof OPERATIONAL_ALERT_SEVERITIES)[number];

export const OPERATIONAL_ALERT_SUBJECTS = ['VEHICLE', 'DRIVER', 'COMPANY'] as const;
export type OperationalAlertSubject = (typeof OPERATIONAL_ALERT_SUBJECTS)[number];

/** Nguon nam ngoai `transport-asset-compliance`, moi cai thuoc mot capability co the dang tat. */
export const OPERATIONAL_ALERT_SOURCES = ['FUEL_CONSUMPTION', 'DRIVER_FUND'] as const;
export type OperationalAlertSource = (typeof OPERATIONAL_ALERT_SOURCES)[number];

export interface OperationalAlert {
  readonly kind: OperationalAlertKind;
  readonly severity: OperationalAlertSeverity;
  readonly subjectKind: OperationalAlertSubject;
  /** `null` chi voi giay to cua CONG TY. */
  readonly subjectId: string | null;
  /** Con so di kem — chi gia tri vo huong, khong bao gio noi dung nhay cam. */
  readonly detail: Readonly<Record<string, number | string | null>>;
}

export interface OperationalAlertFeed {
  readonly generatedFor: BusinessDate;
  readonly alerts: readonly OperationalAlert[];
  /**
   * Nguon VANG MAT vi capability so huu no dang tat.
   *
   * Khai tuong minh thay vi tra mot danh sach ngan hon trong im lang: mot bang thieu muc "tieu hao
   * dau bat thuong" trong khi khong ai biet la no bi tat trong se doc giong het mot bang noi rang
   * moi xe deu on.
   */
  readonly unavailableSources: readonly OperationalAlertSource[];
}

const SEVERITY_ORDER: Readonly<Record<OperationalAlertSeverity, number>> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

/** Nang truoc, roi on dinh theo `kind` de hai lan doc cung du lieu cho ra cung thu tu. */
export const sortAlerts = (alerts: readonly OperationalAlert[]): readonly OperationalAlert[] =>
  [...alerts].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.kind.localeCompare(right.kind) ||
      (left.subjectId ?? '').localeCompare(right.subjectId ?? ''),
  );
