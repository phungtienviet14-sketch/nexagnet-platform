import type { BusinessDate } from '../business-date.js';
import type { VehicleStatus } from '../transport.types.js';

/**
 * KIEU DOC cua `transport-asset-compliance` (`TX-06`).
 *
 * QUY UOC DON VI, khai MOT LAN o day: `odoKm` la so nguyen KILOMET; moi truong ten `*Date` la
 * NGAY nghiep vu `YYYY-MM-DD` (`INV-25`); tien la so nguyen DONG (`GD-03`).
 */

export const MAINTENANCE_TRIGGER_KINDS = ['ODOMETER', 'CALENDAR', 'ODOMETER_OR_CALENDAR'] as const;
export type MaintenanceTriggerKind = (typeof MAINTENANCE_TRIGGER_KINDS)[number];

export const MAINTENANCE_PLAN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MaintenancePlanStatus = (typeof MAINTENANCE_PLAN_STATUSES)[number];

export const MAINTENANCE_WORK_ORDER_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type MaintenanceWorkOrderStatus = (typeof MAINTENANCE_WORK_ORDER_STATUSES)[number];

export const COMPLIANCE_DOCUMENT_TYPES = [
  'VEHICLE_INSPECTION',
  'VEHICLE_INSURANCE',
  'VEHICLE_TRANSPORT_BADGE',
  'DRIVER_LICENCE',
  'COMPANY_TRANSPORT_LICENSE',
  'CONDITIONAL_CARGO_PERMIT',
] as const;
export type ComplianceDocumentType = (typeof COMPLIANCE_DOCUMENT_TYPES)[number];

export const COMPLIANCE_SUBJECT_KINDS = ['VEHICLE', 'DRIVER', 'COMPANY'] as const;
export type ComplianceSubjectKind = (typeof COMPLIANCE_SUBJECT_KINDS)[number];

export const COMPLIANCE_DOCUMENT_STATUSES = ['ACTIVE', 'SUPERSEDED', 'REVOKED'] as const;
export type ComplianceDocumentStatus = (typeof COMPLIANCE_DOCUMENT_STATUSES)[number];

export interface MaintenancePlan {
  readonly id: string;
  readonly vehicleId: string;
  readonly name: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
  readonly status: MaintenancePlanStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaintenanceWorkOrder {
  readonly id: string;
  readonly vehicleId: string;
  readonly planId: string | null;
  readonly status: MaintenanceWorkOrderStatus;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly openedBy: string;
  readonly openedAt: string;
  readonly completedDate: BusinessDate | null;
  readonly completedOdoKm: number | null;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  readonly cancellationReason: string | null;
  readonly costAmount: number | null;
  readonly currencyCode: string;
  readonly costingExpenseRef: string | null;
  readonly note: string | null;
  readonly updatedAt: string;
}

export interface ComplianceDocument {
  readonly id: string;
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly documentNo: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
  readonly status: ComplianceDocumentStatus;
  readonly evidenceRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/* ---------------------------------------------------------------- *
 * HINH CHIEU — tinh luc DOC, khong luu cot. Xem `compliance-alerts.ts`
 * va `maintenance-schedule.ts`.
 * ---------------------------------------------------------------- */

export const COMPLIANCE_HEALTHS = ['HEALTHY', 'DUE_SOON', 'EXPIRED'] as const;
export type ComplianceHealth = (typeof COMPLIANCE_HEALTHS)[number];

export interface ComplianceAlert {
  readonly documentId: string;
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly validTo: BusinessDate;
  readonly health: ComplianceHealth;
  /** Am khi da qua han. `0` la het han DUNG hom nay. */
  readonly daysUntilExpiry: number;
  /** Nguong da dung cho DONG NAY — co the khac nhau giua cac loai giay to (`GD-18`). */
  readonly thresholdDays: number;
}

export const MAINTENANCE_DUE_STATES = ['OK', 'DUE_SOON', 'OVERDUE'] as const;
export type MaintenanceDueState = (typeof MAINTENANCE_DUE_STATES)[number];

/** Can cu da lam ke hoach den han TRUOC. `null` khi chua den han theo can cu nao. */
export const MAINTENANCE_DUE_TRIGGERS = ['ODOMETER', 'CALENDAR'] as const;
export type MaintenanceDueTrigger = (typeof MAINTENANCE_DUE_TRIGGERS)[number];

export interface MaintenanceDue {
  readonly planId: string;
  readonly vehicleId: string;
  readonly planName: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly state: MaintenanceDueState;
  /** Moc km phai bao duong. `null` khi ke hoach khong tinh theo km. */
  readonly dueAtOdoKm: number | null;
  /** Moc ngay phai bao duong. `null` khi ke hoach khong tinh theo thoi gian. */
  readonly dueOnDate: BusinessDate | null;
  /** Am khi da vuot moc. `null` khi khong tinh theo km. */
  readonly odoRemainingKm: number | null;
  /** Am khi da qua moc. `null` khi khong tinh theo thoi gian. */
  readonly daysRemaining: number | null;
  /** Can cu da dat nguong truoc — VT-063 "cai nao toi truoc". */
  readonly reachedBy: MaintenanceDueTrigger | null;
  readonly currentOdoKm: number;
  readonly lastServicedDate: BusinessDate;
  readonly lastServicedOdoKm: number;
}

/* ---------------------------------------------------------------- *
 * TRANG THAI HIEU LUC CUA XE — T1 §7.2 + §18.2.
 * ---------------------------------------------------------------- */

/**
 * KHONG SUY DUOC bang mot `boolean`. Mot cong co hai duong lech thi phai phan biet duoc hai ly do,
 * vi hai viec phai lam khac han nhau: cai thu nhat la dieu do vien goi lai xe ve, cai thu hai la
 * mot dong du lieu cu can duoc dong bo.
 */
export const VEHICLE_STATE_INCONSISTENCIES = [
  /** Xe dang co lenh sua MO ma van co chuyen `IN_TRANSIT` phan cong cho no — acceptance 9. */
  'MAINTENANCE_WHILE_IN_TRANSIT',
  /** Cot `TransportVehicle.status` khong con khop voi trang thai hieu luc — T1 §18.2. */
  'RECORDED_STATUS_STALE',
] as const;
export type VehicleStateInconsistency = (typeof VEHICLE_STATE_INCONSISTENCIES)[number];

export const EFFECTIVE_VEHICLE_STATE_REASONS = [
  'MAINTENANCE_LOCK',
  'ACTIVE_IN_TRANSIT_TRIP',
  'NO_ACTIVE_WORK',
] as const;
export type EffectiveVehicleStateReason = (typeof EFFECTIVE_VEHICLE_STATE_REASONS)[number];

export interface EffectiveVehicleState {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  /** Ket qua cua phep hop thanh — day moi la cai bang dieu khien duoc doc. */
  readonly effectiveStatus: VehicleStatus;
  readonly reason: EffectiveVehicleStateReason;
  /** Cot dang luu. Giu lai de nhin thay do lech, khong phai de tin. */
  readonly recordedStatus: VehicleStatus;
  readonly openWorkOrderIds: readonly string[];
  readonly inTransitTripIds: readonly string[];
  readonly inconsistencies: readonly VehicleStateInconsistency[];
}
