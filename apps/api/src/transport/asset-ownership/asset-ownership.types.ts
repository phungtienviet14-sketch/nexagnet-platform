import type { PartyStatus } from '../transport.types.js';

/**
 * QUYEN SO HUU TAI SAN — `TX-08`, Issue #242 Lane E.
 *
 * Hai truc doc lap, va viec giu chung tach nhau la ca diem cua mien nay:
 *
 *   · `VehicleOperationalControl` — AI DIEU HANH chiec xe;
 *   · `VehicleOwnershipInterest`  — AI SO HUU no, bao nhieu, tu bao gio den bao gio.
 *
 * Mot xe dong so huu ma B van dieu hanh la xe NOI BO. Suy "co ben huu quan => xe ngoai" la sai o
 * moi cau hoi van hanh: B van phan cong lai xe, van chiu chi phi, van thu cuoc.
 */

/** CA NHAN hay TO CHUC. Khong co gia tri thu ba cho toi khi co nguoi thuc su can. */
export const ASSET_STAKEHOLDER_KINDS = ['PERSON', 'ORGANIZATION'] as const;
export type AssetStakeholderKind = (typeof ASSET_STAKEHOLDER_KINDS)[number];

/** AI DIEU HANH mot xe — TRUC DOC LAP voi quyen so huu. */
export const VEHICLE_OPERATIONAL_CONTROLS = ['INTERNAL_OPERATED', 'EXTERNAL_CARRIER'] as const;
export type VehicleOperationalControl = (typeof VEHICLE_OPERATIONAL_CONTROLS)[number];

/** Toan bo mot chiec xe = 10000 diem co ban. Khong phai `100`, va khong phai `1.0`. */
export const OWNERSHIP_BASIS_POINTS_TOTAL = 10_000;

/**
 * BEN HUU QUAN.
 *
 * KHONG co `authUserId` trong khung nhin doc, va do la co y: cau noi tai khoan la mot chi tiet
 * XAC THUC, khong phai mot su that nghiep vu. Ro ri no ra API se bien mot bang danh sach ben huu
 * quan thanh mot bang anh xa nguoi dung — thu ma khong man hinh nao can va moi ke tan cong deu
 * muon. `hasAccount` tra loi dung cau hoi ma man hinh quan tri that su hoi.
 */
export interface AssetStakeholder {
  readonly id: string;
  readonly kind: AssetStakeholderKind;
  readonly displayName: string;
  readonly status: PartyStatus;
  readonly note: string | null;
  /** Da noi voi mot tai khoan dang nhap hay chua. KHONG lo ra tai khoan nao. */
  readonly hasAccount: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * MOT QUYEN LOI SO HUU trong mot khoang thoi gian.
 *
 * `effectiveTo === null` nghia la DANG hieu luc. Mot ban da dong khong bi xoa va khong bi ghi de —
 * no o lai de cau hoi "thang 3 nam ngoai ai so huu xe nay" luon co cau tra loi.
 */
export interface VehicleOwnershipInterest {
  readonly id: string;
  readonly vehicleId: string;
  readonly stakeholderId: string;
  /** Ten hien thi cua ben huu quan — de man hinh khong phai lo ma dinh danh ra nhan. */
  readonly stakeholderName: string;
  readonly stakeholderKind: AssetStakeholderKind;
  /** 1..10000 diem co ban. SO NGUYEN — xem `OWNERSHIP_BASIS_POINTS_TOTAL`. */
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly recordedBy: string;
  readonly recordedNote: string | null;
  readonly closedBy: string | null;
  readonly closedNote: string | null;
  readonly createdAt: string;
}

/**
 * SO DANG KY SO HUU cua mot xe — khung nhin doc cua man hinh quan tri.
 *
 * `unattributedBasisPoints` la phan CHUA QUY duoc cho ai. No co gia tri khi so dang ky chua duoc
 * khai la day du, va do la mot trang thai HOP LE: mot doanh nghiep dang nhap dan du lieu that su
 * chi biet mot phan. Buoc no ve 0 se buoc nguoi nhap bia not phan con lai.
 *
 * Khi `registerComplete === true`, `unattributedBasisPoints` luon la `0` — bat bien do duoc cuong
 * che o moi lan ghi, khong phai tinh lai luc doc.
 */
export interface VehicleOwnershipRegister {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly operationalControl: VehicleOperationalControl;
  readonly registerComplete: boolean;
  /** Cac quyen loi DANG hieu luc, sap theo ty le giam dan roi ten tang dan. */
  readonly current: readonly VehicleOwnershipInterest[];
  readonly currentBasisPointsTotal: number;
  readonly unattributedBasisPoints: number;
  /** Cac quyen loi DA DONG, moi nhat truoc. */
  readonly history: readonly VehicleOwnershipInterest[];
}

/**
 * KHUNG NHIN CUA BEN HUU QUAN cho MOT xe — "Xe toi co co phan".
 *
 * Danh sach truong o day la mot QUYET DINH BAO MAT, khong phai mot lua chon giao dien. #242 E3 liet
 * ke pham vi duong tinh, va moi thu ngoai danh sach do la tu choi mac dinh. Cu the, KHONG co o day:
 * gia cuoc, bien truc tiep, cong no khach, luong lai xe, va toa do.
 *
 * `driverName` co mat vi mot dong so huu hoi "ai dang lai xe cua toi" la mot cau hoi chinh dang ve
 * TAI SAN cua ho; so dien thoai, luong va ho so ca nhan cua lai xe thi khong.
 */
export interface StakeholderVehicleView {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly status: string;
  readonly operationalControl: VehicleOperationalControl;
  readonly currentOdoKm: number;
  /** Ty le so huu DANG hieu luc cua chinh nguoi dang xem. */
  readonly myBasisPoints: number;
  readonly myEffectiveFrom: string;
  /** Lich su so huu CUA CHINH HO tren xe nay — khong phai cua cac dong so huu khac. */
  readonly myHistory: readonly StakeholderOwnershipPeriod[];
  readonly driverName: string | null;
}

/** Mot doan so huu cua chinh nguoi dang xem. Khong mang ten nguoi ghi — do la viec noi bo cua B. */
export interface StakeholderOwnershipPeriod {
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

/**
 * DANH TINH ben huu quan da giai duoc tu mot phien dang nhap.
 *
 * `vehicleIds` la TOAN BO pham vi — mot tap dong. Moi duong doc cua be mat ben huu quan phai loc
 * qua tap nay, va khong duong nao duoc nhan `vehicleId` tu nguoi goi roi tin no.
 */
export interface StakeholderScope {
  readonly stakeholderId: string;
  readonly displayName: string;
  readonly vehicleIds: readonly string[];
}
