import { TOLL_PROVIDER_LABEL, formatBusinessDate } from '../customer-view';
import type { CreateTollAccountInput, OpenTollLinkInput } from '../transport-api';
import type {
  TollAccount,
  TollAccountVehicleLink,
  TollProvider,
  Vehicle,
} from '../transport-types';

/**
 * QUAN TRI TAI KHOAN GIAO THONG va SO XE NHAN CHI TRA — `#314` G7. Phan QUYET DINH, tach khoi phan ve.
 *
 * ============================================================================================
 * MAY CHU LA CONG THAT — TEP NAY CHI NOI TRUOC NHUNG GI MAY CHU SE NOI
 * ============================================================================================
 *
 * Moi rang buoc o day la mot BAN SAO cua mot luat may chu (`toll.schemas.ts`, `toll-account-link.ts`):
 * so tai khoan bat buoc, ngay mo bat buoc, ngay dong khong truoc ngay mo (hai dau deu tinh). Chung ton
 * tai de nguoi dung thay loi TRUOC khi gui, khong de thay the may chu. Rieng phep "hai doan cua mot xe
 * chong nhau" thi KHONG chep ve day: no can du lieu cua moi tai khoan, va may chu tra loi dung cau do
 * bang `TOLL_VEHICLE_ALREADY_LINKED` — man hinh hien nguyen van, kem lich su cua chinh chiec xe.
 *
 * ============================================================================================
 * KHONG CHON XE GIUP
 * ============================================================================================
 *
 * Ban nhap bat dau voi `vehicleId: ''`. Chon san mot xe (xe dau danh sach, xe "gan giong" bien so tren
 * tep) la dung loi ma ca mien ETC duoc xay de tranh: mot chi phi gan cho mot xe khong ai chon.
 */

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Cung phep kiem voi `assertBusinessDate`: dung dang VA co that (`2026-02-30` khong co that). */
const isBusinessDate = (value: string): boolean => {
  if (!BUSINESS_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const MAX_TEXT = 200;

/* ------------------------------------------------------------------ *
 * Tai khoan
 * ------------------------------------------------------------------ */

export interface TollAccountDraft {
  readonly provider: TollProvider;
  readonly accountNo: string;
  readonly holderName: string;
}

export const EMPTY_TOLL_ACCOUNT_DRAFT: TollAccountDraft = {
  provider: 'VETC',
  accountNo: '',
  holderName: '',
};

export const tollAccountDraftProblem = (draft: TollAccountDraft): string | null => {
  const accountNo = draft.accountNo.trim();
  if (accountNo === '') return 'Nhập số tài khoản do nhà cung cấp cấp.';
  if (accountNo.length > MAX_TEXT) return `Số tài khoản dài quá ${String(MAX_TEXT)} ký tự.`;
  if (draft.holderName.trim().length > MAX_TEXT) {
    return `Tên chủ tài khoản dài quá ${String(MAX_TEXT)} ký tự.`;
  }
  return null;
};

export const toCreateTollAccountInput = (draft: TollAccountDraft): CreateTollAccountInput => ({
  provider: draft.provider,
  accountNo: draft.accountNo.trim(),
  holderName: draft.holderName.trim() === '' ? null : draft.holderName.trim(),
});

export interface TollAccountToggleCopy {
  readonly title: string;
  readonly detail: string;
  readonly confirmLabel: string;
  readonly nextActive: boolean;
}

/**
 * CAU HOI XAC NHAN noi DUNG dieu may chu lam — do tren kho that, khong suy tu ten nut.
 *
 * `listAccounts` KHONG loc theo `active`, nen tai khoan da ngung VAN duoc nhan ra tren bang ke va cac
 * doan noi cu VAN dung de doc xe. Chi `openLink` tu choi no. Noi "ngung se dung doi soat tai khoan
 * nay" la mot loi hua sai, va no se lam ke toan tuong nhung dong sau do la loi.
 */
export const tollAccountToggleCopy = (account: TollAccount): TollAccountToggleCopy => {
  const name = `${TOLL_PROVIDER_LABEL[account.provider]} ${account.accountNo}`;
  return account.active
    ? {
        title: `Ngừng dùng tài khoản ${name}?`,
        detail:
          'Tài khoản đã ngừng dùng không nối thêm được xe nào. Các đoạn nối đã có, các dòng đã nạp và việc ' +
          'nhận ra tài khoản này trên bảng kê vẫn giữ nguyên — ngừng dùng không xoá và không đóng đoạn nào.',
        confirmLabel: 'Ngừng dùng',
        nextActive: false,
      }
    : {
        title: `Dùng lại tài khoản ${name}?`,
        detail: 'Tài khoản sẽ nối thêm được xe mới. Không đoạn nối nào tự mở lại.',
        confirmLabel: 'Dùng lại',
        nextActive: true,
      };
};

/* ------------------------------------------------------------------ *
 * Doan noi xe <-> tai khoan
 * ------------------------------------------------------------------ */

export interface TollLinkDraft {
  readonly vehicleId: string;
  readonly providerVehicleRef: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
}

export const EMPTY_TOLL_LINK_DRAFT: TollLinkDraft = {
  vehicleId: '',
  providerVehicleRef: '',
  effectiveFrom: '',
  effectiveTo: '',
};

/** Loi DAU TIEN cua ban nhap, hoac `null`. */
export const tollLinkDraftProblem = (draft: TollLinkDraft): string | null => {
  if (draft.vehicleId === '') return 'Chọn xe nhận chi trả từ tài khoản này.';
  if (draft.effectiveFrom === '') return 'Nhập ngày bắt đầu hiệu lực.';
  if (!isBusinessDate(draft.effectiveFrom)) return 'Ngày bắt đầu không phải một ngày hợp lệ.';
  if (draft.effectiveTo !== '' && !isBusinessDate(draft.effectiveTo)) {
    return 'Ngày kết thúc không phải một ngày hợp lệ.';
  }
  // Chuoi `YYYY-MM-DD` so sanh duoc theo thu tu lich — cung phep so cua `tollLinkPeriodInvalid`.
  if (draft.effectiveTo !== '' && draft.effectiveTo < draft.effectiveFrom) {
    return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu — cả hai ngày đều được tính.';
  }
  if (draft.providerVehicleRef.trim().length > MAX_TEXT) {
    return `Mã xe bên nhà cung cấp dài quá ${String(MAX_TEXT)} ký tự.`;
  }
  return null;
};

export const toOpenTollLinkInput = (draft: TollLinkDraft): OpenTollLinkInput => ({
  vehicleId: draft.vehicleId,
  providerVehicleRef:
    draft.providerVehicleRef.trim() === '' ? null : draft.providerVehicleRef.trim(),
  effectiveFrom: draft.effectiveFrom,
  effectiveTo: draft.effectiveTo === '' ? null : draft.effectiveTo,
});

/** Vi sao KHONG noi xe vao tai khoan nay duoc luc nay — `null` = noi duoc. */
export const tollOpenLinkBlockedReason = (
  account: TollAccount | undefined,
  canManage: boolean,
): string | null => {
  if (!canManage) return 'Vai của bạn chỉ xem, không nối được xe vào tài khoản.';
  if (account === undefined) return 'Chọn một tài khoản trước.';
  if (!account.active) return 'Tài khoản đã ngừng dùng — dùng lại tài khoản trước khi nối xe.';
  return null;
};

/**
 * DONG mot doan noi. `effectiveTo` la ngay CUOI CUNG xe con nhan chi tra tu tai khoan nay — hai dau
 * deu tinh, nen dong dung ngay mo la hop le (doan dai mot ngay).
 */
export const tollCloseLinkProblem = (
  link: Pick<TollAccountVehicleLink, 'effectiveFrom' | 'effectiveTo'>,
  effectiveTo: string,
): string | null => {
  if (link.effectiveTo !== null) {
    return `Đoạn này đã đóng từ ${formatBusinessDate(link.effectiveTo)}.`;
  }
  if (effectiveTo === '') {
    return 'Nhập ngày kết thúc — ngày cuối cùng xe còn nhận chi trả từ tài khoản này.';
  }
  if (!isBusinessDate(effectiveTo)) return 'Ngày kết thúc không phải một ngày hợp lệ.';
  if (effectiveTo < link.effectiveFrom) {
    return `Ngày kết thúc phải sau hoặc bằng ngày bắt đầu (${formatBusinessDate(link.effectiveFrom)}).`;
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * Nhan cua xe va tai khoan
 * ------------------------------------------------------------------ */

export interface TollVehicleOption {
  readonly id: string;
  readonly label: string;
}

/** Danh sach de NGUOI chon — sap theo bien so. Khong co lua chon mac dinh nao. */
export const toTollVehicleOptions = (
  vehicles: readonly Vehicle[] | undefined,
): readonly TollVehicleOption[] =>
  [...(vehicles ?? [])]
    .map((vehicle) => ({ id: vehicle.id, label: vehicle.registrationPlate }))
    .sort((left, right) => (left.label < right.label ? -1 : left.label > right.label ? 1 : 0));

const shortId = (id: string): string => `…${id.slice(-6)}`;

/**
 * BIEN SO cua mot xe. Hai truong hop "khong co bien so" noi HAI cau khac nhau: doi xe chua doc duoc
 * (chua biet) va xe khong con trong doi xe (da biet la khong con). Gop lam mot la noi doi mot trong hai.
 */
export const tollVehicleLabelOf =
  (vehicles: readonly Vehicle[] | undefined) =>
  (vehicleId: string): string => {
    if (vehicles === undefined) return `Xe mã ${shortId(vehicleId)} (chưa đọc được đội xe)`;
    const found = vehicles.find((vehicle) => vehicle.id === vehicleId);
    return found ? found.registrationPlate : `Không còn trong đội xe (mã ${shortId(vehicleId)})`;
  };

export const tollAccountLabelOf =
  (accounts: readonly TollAccount[] | undefined) =>
  (accountId: string): string => {
    const found = (accounts ?? []).find((account) => account.id === accountId);
    return found
      ? `${TOLL_PROVIDER_LABEL[found.provider]} ${found.accountNo}`
      : 'Tài khoản không còn trong danh sách';
  };
