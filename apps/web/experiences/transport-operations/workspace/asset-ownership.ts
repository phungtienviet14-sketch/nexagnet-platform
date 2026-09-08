import { formatInstant, formatOdometer } from '../customer-view';
import {
  OWNERSHIP_BASIS_POINTS_TOTAL,
  type AssetStakeholder,
  type StakeholderVehicleView,
  type VehicleOperationalControl,
  type VehicleOwnershipInterest,
  type VehicleOwnershipRegister,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man So huu tai san (`TX-08`, #242 E5).
 *
 * RANH GIOI PHAI GIU: tep nay KHONG duoc suy quyen dieu hanh tu quyen so huu. Mot xe co ben huu
 * quan van la xe B dieu hanh cho toi khi `operationalControl` noi khac — do la mot cot rieng, va
 * `asset-ownership.spec.ts` do dieu do.
 */

/* ------------------------------------------------------------------ *
 * Diem co ban -> chu cho nguoi doc
 * ------------------------------------------------------------------ */

/**
 * `2500` -> `"25%"`, `3333` -> `"33,33%"`.
 *
 * Chia o TANG HIEN THI va khong bao gio o tang du lieu: moi phep tinh (tong, phan chua quy) lam
 * tren so NGUYEN diem co ban, va chi con so cuoi cung dua cho mat nguoi moi doi don vi. Lam nguoc
 * lai — luu phan tram roi nhan len khi tinh — la cach mot bat bien "tong = 100%" tro thanh mot phep
 * so sanh dau phay dong khong bao gio dung.
 */
export const formatBasisPoints = (basisPoints: number): string => {
  const percent = basisPoints / 100;
  const text = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text.replace('.', ',')}%`;
};

/* ------------------------------------------------------------------ *
 * Phan loai xe theo HAI truc
 * ------------------------------------------------------------------ */

/**
 * BON nhom, va chung tra loi HAI cau hoi khac nhau — do la ca diem cua #242 E1.
 *
 * `external-carrier` den tu `operationalControl`; ba nhom con lai den tu SO DANG KY. Mot xe
 * `co-owned` VAN la xe B dieu hanh: no nam o nhom nay vi co nhieu ben huu quan, khong phai vi ai
 * do dieu hanh no thay B.
 *
 * `unregistered` la mot cau tra loi TRUNG THUC, khong phai mot o trong: no noi "chua ai nhap so
 * huu cho xe nay", chu khong noi "xe nay 100% cua B". Suy dieu thu hai tu du lieu rong la bia ra
 * mot su that phap ly ma khong ai khai.
 */
export type VehicleOwnershipClass = 'external-carrier' | 'sole-owner' | 'co-owned' | 'unregistered';

export const OWNERSHIP_CLASS_LABEL: Readonly<Record<VehicleOwnershipClass, string>> = {
  'external-carrier': 'Nhà xe ngoài',
  'sole-owner': 'Một chủ sở hữu',
  'co-owned': 'Đồng sở hữu',
  unregistered: 'Chưa ghi sở hữu',
};

export const OPERATIONAL_CONTROL_LABEL: Readonly<Record<VehicleOperationalControl, string>> = {
  INTERNAL_OPERATED: 'Công ty điều hành',
  EXTERNAL_CARRIER: 'Nhà xe ngoài điều hành',
};

export const ASSET_STAKEHOLDER_KIND_LABEL = {
  PERSON: 'Cá nhân',
  ORGANIZATION: 'Tổ chức',
} as const;

/**
 * Phan loai mot xe tu quyen dieu hanh + cac quyen loi DANG hieu luc.
 *
 * `external-carrier` duoc quyet TRUOC, va co y: mot xe nha ngoai co the van co ben huu quan (B gop
 * von vao xe cua doi tac), nhung cau hoi van hanh dau tien ve no la "ai chay no", nen do la nhan
 * nguoi truc can thay.
 */
export const classifyVehicleOwnership = (
  operationalControl: VehicleOperationalControl,
  currentInterests: readonly VehicleOwnershipInterest[],
): VehicleOwnershipClass => {
  if (operationalControl === 'EXTERNAL_CARRIER') return 'external-carrier';
  if (currentInterests.length === 0) return 'unregistered';
  if (currentInterests.length > 1) return 'co-owned';
  return currentInterests[0]?.ownershipBasisPoints === OWNERSHIP_BASIS_POINTS_TOTAL
    ? 'sole-owner'
    : 'co-owned';
};

/* ------------------------------------------------------------------ *
 * Hang cua bang so dang ky
 * ------------------------------------------------------------------ */

export interface OwnershipInterestRow {
  readonly id: string;
  readonly stakeholderName: string;
  readonly stakeholderKindLabel: string;
  readonly shareLabel: string;
  readonly basisPoints: number;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly isCurrent: boolean;
  /** Nguoi ghi/nguoi dong + ghi chu — nguon goc ma #242 E2 doi phai giu. */
  readonly provenanceLabel: string;
}

const provenanceOf = (row: VehicleOwnershipInterest): string => {
  const opened = `Ghi bởi ${row.recordedBy}`;
  const openNote = row.recordedNote === null ? '' : ` — ${row.recordedNote}`;
  if (row.effectiveTo === null) return `${opened}${openNote}`;
  const closed = row.closedBy === null ? 'Đã đóng' : `Đóng bởi ${row.closedBy}`;
  const closeNote = row.closedNote === null ? '' : ` — ${row.closedNote}`;
  return `${opened}${openNote} · ${closed}${closeNote}`;
};

export const toOwnershipInterestRows = (
  rows: readonly VehicleOwnershipInterest[],
): readonly OwnershipInterestRow[] =>
  rows.map((row) => ({
    id: row.id,
    stakeholderName: row.stakeholderName,
    stakeholderKindLabel: ASSET_STAKEHOLDER_KIND_LABEL[row.stakeholderKind],
    shareLabel: formatBasisPoints(row.ownershipBasisPoints),
    basisPoints: row.ownershipBasisPoints,
    fromLabel: formatInstant(row.effectiveFrom),
    toLabel: row.effectiveTo === null ? 'Đang hiệu lực' : formatInstant(row.effectiveTo),
    isCurrent: row.effectiveTo === null,
    provenanceLabel: provenanceOf(row),
  }));

/* ------------------------------------------------------------------ *
 * Tom tat mot so dang ky
 * ------------------------------------------------------------------ */

export interface OwnershipRegisterSummary {
  readonly plate: string;
  readonly ownershipClass: VehicleOwnershipClass;
  readonly ownershipClassLabel: string;
  readonly controlLabel: string;
  readonly totalLabel: string;
  readonly unattributedLabel: string | null;
  readonly registerComplete: boolean;
  /** Cau noi ro trang thai so dang ky — day la cho de nguoi dung hieu sai nhat. */
  readonly completenessNote: string;
}

/**
 * `unattributedLabel` la `null` khi so dang ky da khai day du.
 *
 * Hien "chưa quy: 0%" o do la mot dong nhieu: no goi y rang van con mot phan de dien, trong khi bat
 * bien da dong va he thong se tu choi moi lan ghi them.
 */
export const toRegisterSummary = (register: VehicleOwnershipRegister): OwnershipRegisterSummary => {
  const ownershipClass = classifyVehicleOwnership(register.operationalControl, register.current);
  return {
    plate: register.registrationPlate,
    ownershipClass,
    ownershipClassLabel: OWNERSHIP_CLASS_LABEL[ownershipClass],
    controlLabel: OPERATIONAL_CONTROL_LABEL[register.operationalControl],
    totalLabel: formatBasisPoints(register.currentBasisPointsTotal),
    unattributedLabel: register.registerComplete
      ? null
      : formatBasisPoints(register.unattributedBasisPoints),
    registerComplete: register.registerComplete,
    completenessNote: register.registerComplete
      ? 'Sổ đăng ký đã khai đầy đủ: tổng tỷ lệ phải luôn đúng 100%, và hệ thống từ chối mọi lần ghi làm vượt.'
      : 'Sổ đăng ký chưa khai đầy đủ: tổng tỷ lệ được phép nhỏ hơn 100%. Dữ liệu thiếu là trạng thái hợp lệ.',
  };
};

/* ------------------------------------------------------------------ *
 * Ho so ben huu quan
 * ------------------------------------------------------------------ */

export interface StakeholderRow {
  readonly id: string;
  readonly displayName: string;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly accountLabel: string;
  readonly note: string;
}

/**
 * `accountLabel` noi CO tai khoan hay khong — khong bao gio noi la tai khoan nao.
 *
 * May chu khong tra ve `authUserId`, va man hinh khong duoc doi hoi no: mot bang danh sach ben huu
 * quan mang dinh danh nguoi dung la mot bang anh xa tai khoan.
 */
export const toStakeholderRows = (rows: readonly AssetStakeholder[]): readonly StakeholderRow[] =>
  rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    kindLabel: ASSET_STAKEHOLDER_KIND_LABEL[row.kind],
    statusLabel: row.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã ngừng',
    accountLabel: row.hasAccount ? 'Đã mở tài khoản xem' : 'Chưa mở tài khoản',
    note: row.note ?? '—',
  }));

/* ------------------------------------------------------------------ *
 * Be mat ben huu quan — "Xe toi co co phan"
 * ------------------------------------------------------------------ */

export interface MyVehicleRow {
  readonly vehicleId: string;
  readonly plate: string;
  readonly vehicleClass: string;
  readonly statusLabel: string;
  readonly controlLabel: string;
  readonly odometerLabel: string;
  readonly shareLabel: string;
  readonly sinceLabel: string;
  readonly driverLabel: string;
  readonly historyLabels: readonly string[];
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  IDLE: 'Đang rảnh',
  ON_TRIP: 'Đang trên chuyến',
  UNDER_MAINTENANCE: 'Đang bảo dưỡng',
};

/**
 * KHONG hien `vehicleId` o bat ky nhan nao — #242 E5 (*"Do not expose raw DB IDs as labels"*).
 *
 * `vehicleId` chi di vao thuoc tinh `key` cua React va vao duong dan khi mo chi tiet. Bien so la
 * dinh danh nguoi doc nhan ra, va no da du.
 */
export const toMyVehicleRows = (rows: readonly StakeholderVehicleView[]): readonly MyVehicleRow[] =>
  rows.map((row) => ({
    vehicleId: row.vehicleId,
    plate: row.registrationPlate,
    vehicleClass: row.vehicleClass,
    statusLabel: STATUS_LABEL[row.status] ?? row.status,
    controlLabel: OPERATIONAL_CONTROL_LABEL[row.operationalControl],
    odometerLabel: formatOdometer(row.currentOdoKm),
    shareLabel: formatBasisPoints(row.myBasisPoints),
    sinceLabel: formatInstant(row.myEffectiveFrom),
    driverLabel: row.driverName ?? 'Chưa phân công',
    historyLabels: row.myHistory.map(
      (period) =>
        `${formatBasisPoints(period.ownershipBasisPoints)} · từ ${formatInstant(period.effectiveFrom)}` +
        (period.effectiveTo === null
          ? ' · đang hiệu lực'
          : ` đến ${formatInstant(period.effectiveTo)}`),
    ),
  }));
