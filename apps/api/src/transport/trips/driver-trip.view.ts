import type { BusinessDate } from '../business-date.js';
import type { TransportCustomer, Trip, TripAssignment, Vehicle } from '../transport.types.js';
import type { TripKind, TripStatus } from './trip-lifecycle.js';

/**
 * KHUNG NHIN CUA LAI XE — `INV-09`, VT-083, `GD-23`.
 *
 * Day la mot KIEU RIENG, khong phai `Trip` da bi loc bot truong. Su khac biet la toan bo ly do no
 * ton tai:
 *
 *   · loc theo vai   -> lan THEM TRUONG sau la lan no ro ra, vi khong ai nho cap nhat danh sach loc;
 *   · kieu rieng     -> them truong doanh thu vao `Trip` khong lam gi duoc o day ca, vi phep anh xa
 *                       ben duoi phai duoc VIET RA moi co truong.
 *
 * Nen o day KHONG co `freightAmount`, khong co `currencyCode`, va khong duoc phep co. Bai test
 * `trip.service.spec.ts` quet moi khoa cua payload theo chieu sau de khoa dieu do lai.
 */
export interface DriverTripView {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly distanceKm: number | null;
  /** Ten khach de lai xe biet giao cho ai — KHONG kem dieu khoan hay so tien nao. */
  readonly customerName: string | null;
  readonly vehicleRegistrationPlate: string | null;
  /** Luc ban phan cong dang xet bat dau. */
  readonly assignedAt: string | null;
  /** `false` = lai xe nay DA bi thay the; con doc duoc lich su nhung khong con quyen thao tac. */
  readonly isCurrentAssignee: boolean;
}

export interface DriverTripViewSources {
  readonly trip: Trip;
  readonly assignment: TripAssignment | null;
  readonly vehicle: Vehicle | null;
  readonly customer: TransportCustomer | null;
  readonly isCurrentAssignee: boolean;
}

/**
 * Phep anh xa TUONG MINH tung truong.
 *
 * CO Y khong dung `{ ...trip, freightAmount: undefined }` hay mot ham `omit()`: ca hai deu la
 * "loc" doi lot, va ca hai deu de lot truong moi. O day, mot truong chi co mat neu ai do go ten no
 * ra — va luc go thi phai doc lai chinh khoi chu thich ben tren.
 */
export function toDriverTripView({
  trip,
  assignment,
  vehicle,
  customer,
  isCurrentAssignee,
}: DriverTripViewSources): DriverTripView {
  return {
    id: trip.id,
    code: trip.code,
    kind: trip.kind,
    status: trip.status,
    businessDate: trip.businessDate,
    originLabel: trip.originLabel,
    destinationLabel: trip.destinationLabel,
    cargoDescription: trip.cargoDescription,
    distanceKm: trip.distanceKm,
    customerName: customer?.name ?? null,
    vehicleRegistrationPlate: vehicle?.registrationPlate ?? null,
    assignedAt: assignment?.effectiveFrom ?? null,
    isCurrentAssignee,
  };
}
