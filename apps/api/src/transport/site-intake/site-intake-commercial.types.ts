import type { GeoPoint } from '../geo/geo-point.js';

/**
 * PHAN THUONG MAI cua mot lan tai xe nhan viec truc tiep — `#398`.
 *
 * Mot hang `TransportSiteIntakeCommercial` cho MOT lan xac nhan. No KHONG phai mot mo hinh don thu
 * hai: khong gia, khong khach, khong dieu khoan. No giu DUNG nhung gi can de quyet "du tao don chua"
 * va dau vet "don nao da nhan chang nay". Xem khoi chu thich tren model trong `schema.prisma`.
 */

export const SITE_MATCHES = ['UNIQUE_INSIDE', 'CHOSEN_AMONG_SEVERAL', 'NO_LOCATION'] as const;
export type SiteMatch = (typeof SITE_MATCHES)[number];

export const SITE_INTAKE_COMMERCIAL_STATUSES = ['PENDING', 'ORDER_BOUND', 'REJECTED'] as const;
export type SiteIntakeCommercialStatus = (typeof SITE_INTAKE_COMMERCIAL_STATUSES)[number];

export const SITE_INTAKE_BINDING_MODES = [
  'AUTO_CREATED',
  'OFFICE_COMPLETED',
  'OFFICE_EXISTING_ORDER',
] as const;
export type SiteIntakeBindingMode = (typeof SITE_INTAKE_BINDING_MODES)[number];

export const SITE_INTAKE_DESTINATION_SOURCES = ['KNOWN_PLACE', 'PLACE_SEARCH'] as const;
export type SiteIntakeDestinationSource = (typeof SITE_INTAKE_DESTINATION_SOURCES)[number];

export const SITE_INTAKE_ACTOR_ROLES = ['DRIVER', 'OFFICE'] as const;
export type SiteIntakeActorRole = (typeof SITE_INTAKE_ACTOR_ROLES)[number];

/** Ly do bao bat thuong / huy: toi thieu bay nhieu ky tu SAU khi cat khoang trang (HTTP + dich vu). */
export const EXCEPTION_REASON_MIN_LENGTH = 3;

export const SITE_INTAKE_EXCEPTION_OUTCOMES = [
  'ORDER_CANCELLED_WORK_CANCELLED',
  'ORDER_CANCELLED_OPERATION_PRESERVED',
  'INTAKE_REJECTED_WORK_CANCELLED',
  'INTAKE_REJECTED_OPERATION_PRESERVED',
  'ANOMALY_RECORDED_ORDER_TERMINAL',
] as const;
export type SiteIntakeExceptionOutcome = (typeof SITE_INTAKE_EXCEPTION_OUTCOMES)[number];

/**
 * DIEM GIAO DA DUOC GIAI — may chu da doc toa do tu nguon cua CHINH NO (hang rao, hoac ket qua tim
 * da doi chieu lai). Khong co duong nao de may khach dat thang mot cap so vao day.
 */
export interface ResolvedDestination {
  readonly label: string;
  readonly point: GeoPoint;
  readonly source: SiteIntakeDestinationSource;
  /** `KNOWN_PLACE`: id hang rao. `PLACE_SEARCH`: `null`. */
  readonly ref: string | null;
}

export interface IntakeDestination extends ResolvedDestination {
  readonly setBy: string;
  readonly setByRole: SiteIntakeActorRole;
  readonly setAt: Date;
  readonly eventId: string | null;
}

export interface SiteIntakeCommercial {
  readonly id: string;
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly destination: IntakeDestination | null;
  readonly originAttestation: { readonly by: string; readonly at: Date } | null;
  readonly binding: {
    readonly orderId: string;
    readonly mode: SiteIntakeBindingMode;
    readonly by: string;
    readonly at: Date;
  } | null;
  readonly exception: {
    readonly reason: string;
    readonly outcome: SiteIntakeExceptionOutcome;
    readonly by: string;
    readonly at: Date;
    readonly key: string;
  } | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Cai ma MOT lan ghi thuong mai lam thay doi — de ghi so kiem toan cung giao dich. */
export interface CommercialAuditEntry {
  readonly actor: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
}
