import type { BusinessDate } from './business-date.js';
import type { TripKind, TripStatus } from './trips/trip-lifecycle.js';

/** Trang thai xe — VT-013, dung ba gia tri cua nguon. */
export const VEHICLE_STATUSES = ['IDLE', 'ON_TRIP', 'UNDER_MAINTENANCE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const PARTY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

/**
 * VAI cua mot doi tac van tai — VT-054.
 *
 * MOT DOI TAC MANG NHIEU VAI. Day khong phai mot chi tiet mo hinh hoa ma la mot yeu cau tuong
 * minh cua nguon: cung mot doi tac vua cho thue xe vua mang don ve, va hai chieu cong no cua ho
 * "phai tach ro rang, khong gop chung". Mot cot `partnerType` mot gia tri se ep nguoi nhap phai
 * chon mot trong hai, roi ho se tao HAI ban ghi cho cung mot doanh nghiep — va ke tu do khong con
 * cach nao doi soat duoc tong.
 */
export const PARTNER_ROLE_KINDS = [
  /** Nha xe cho thue — chuyen `EXTERNAL_CARRIER` tra tien cho ho (VT-050). */
  'CARRIER',
  /** Nguon mang don ve — chuyen `PARTNER_REFERRED_INTERNAL_RUN` tra hoa hong cho ho (VT-052). */
  'ORDER_REFERRER',
] as const;
export type PartnerRoleKind = (typeof PARTNER_ROLE_KINDS)[number];

export interface Vehicle {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  /** Tai trong cho phep (kg) — VT-010. Null = chua nhap. */
  readonly allowedPayloadKg: number | null;
  /** VT-012. T2 chi GIU so; nguon cap nhat tu dong moi lan do dau la viec cua T4. */
  readonly currentOdoKm: number;
  readonly status: VehicleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Driver {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  /** Hang GPLX — VT-014. */
  readonly licenceClass: string;
  /** Han GPLX la mot NGAY NGHIEP VU, khong phai mot khoanh khac. */
  readonly licenceExpiry: BusinessDate;
  readonly status: DriverStatus;
  /**
   * Cau noi user dang nhap → lai xe. NULL la binh thuong: mot lai xe co the co ho so truoc khi
   * duoc cap tai khoan.
   *
   * CHI aggregate nay giu no. Nhet `authUserId` vao Trip hay TripAssignment se bien moi bang
   * nghiep vu thanh mot ban sao cua bang user, va lan doi mo hinh danh tinh sau nay se phai sua
   * tat ca — trong khi cau hoi that chi co mot: "nguoi dang dang nhap la lai xe nao?".
   */
  readonly authUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Gan lai xe phu trach mot xe — VT-014, tang DOI XE (`TX-01`).
 *
 * Khac han `TripAssignment` (tang CHUYEN): cai nay tra loi "xe nay thuong ai lai", cai kia tra
 * loi "chuyen nay ai da lai, tu luc nao". Gop hai cau hoi vao mot bang se lam cai thu hai bien
 * mat, vi doi xe thi hiem con doi giua chuyen thi thuong.
 */
export interface VehicleDriverAssignment {
  readonly id: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly effectiveFrom: string;
  /** NULL = dang hieu luc. */
  readonly effectiveTo: string | null;
  readonly createdAt: string;
}

/**
 * KHACH HANG VAN TAI — ben thue van chuyen (VT-021).
 *
 * KHONG dung lai `Dealer` cua mien ban hang du hai ben deu la "doi tac lam an": mot ben la nguoi
 * MUA HANG theo bang gia va chinh sach cong no ban le, ben kia la nguoi THUE MOT CHUYEN. Dung
 * chung mot bang se lam moi truong cua ben nay thanh mot cot rong vinh vien o ben kia.
 */
export interface TransportCustomer {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
  readonly status: PartyStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransportPartner {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  /** MOT hoac NHIEU vai — khong bao gio loai tru nhau (VT-054). */
  readonly roles: readonly PartnerRoleKind[];
  readonly status: PartyStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Trip {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  /** `INV-25` — tinh mot lan luc tao theo mui gio tenant, khong suy lai tu `createdAt`. */
  readonly businessDate: BusinessDate;
  /** `GD-05`: v1 mot diem di, mot diem den. Da diem la `TripStop`, de danh cho luc co nguon. */
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly customerId: string | null;
  /** Nha xe cho chuyen `EXTERNAL_CARRIER`. */
  readonly carrierPartnerId: string | null;
  /** Doi tac mang don cho chuyen `PARTNER_REFERRED_INTERNAL_RUN`. */
  readonly referrerPartnerId: string | null;
  /**
   * DOANH THU — gia cuoc thu khach (VT-021). So nguyen dong.
   * Truong nay la thu ma be mat lai xe KHONG BAO GIO duoc thay (`INV-09`).
   */
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  /** `GD-14` — nhap tay, nullable. */
  readonly distanceKm: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

/**
 * PHAN CONG CHUYEN — `GD-06`: lich su, KHONG ghi de.
 *
 * Neu day la hai cot `vehicleId`/`driverId` tren `Trip` thi doi lai xe giua chuyen se xoa mat dau
 * ai lai luc mot khoan chi phat sinh — va quy trach nhiem quy theo lai xe (T3) mat co so. T1 ghi
 * chi phi dao nguoc cua `GD-06` la "rat cao neu lam sau": du lieu da mat thi khong dung lai duoc.
 */
export interface TripAssignment {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string | null;
  readonly driverId: string | null;
  readonly effectiveFrom: string;
  /** NULL = ban phan cong DANG hieu luc. Dung mot ban duy nhat cho moi chuyen. */
  readonly effectiveTo: string | null;
  readonly assignedBy: string;
  readonly createdAt: string;
}
