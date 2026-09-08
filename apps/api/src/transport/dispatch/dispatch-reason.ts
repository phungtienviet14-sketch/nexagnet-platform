import { decisionReasonLabel } from '../../observability/decision-vocabulary.js';
import type { DispatchCandidateFilterReason } from './dispatch-decisions.js';
import type {
  DispatchCandidateMode,
  DispatchSuitabilityFlag,
  VehicleNextFree,
} from './dispatch.types.js';

/**
 * CAU GIAI THICH cho mot dong trong bang de nghi — do MAY sinh, TAT DINH.
 *
 * ===========================================================================
 * KHONG MOT MO HINH NGON NGU NAO DUOC CHAM VAO TEP NAY.
 *
 * `#277 M7`: *"No LLM may decide ranking authority. AI may later explain the deterministic result,
 * not select the vehicle."* Cau o day la mot phep BIEN DOI tu cac nhan CO KIEU sang tieng Viet:
 * cung dau vao thi cung dau ra, khong goi mang, khong ton mot dong tien nao, va doc duoc trong
 * mot bai kiem thu.
 *
 * ===========================================================================
 * VA KHONG MOT KY TU NAO O DAY DEN TU BEN NGOAI.
 *
 * `#277 M13`: *"candidate reason text cannot contain raw secrets or unsafe provider payload."*
 * Moi manh cau duoc noi lai deu la mot HANG SO trong tep nay, mot con so da lam tron, hoac mot
 * nhan dia diem do chinh nguoi van hanh khai. Than loi cua nha cung cap, URL, tieu de HTTP —
 * khong thu nao co duong di vao day.
 */

const MODE_PHRASE: Readonly<Record<DispatchCandidateMode, string>> = {
  CURRENT_NEAR: 'tu cho xe dang dung',
  NEXT_FREE_NEAR: 'tu cho xe se ranh',
};

const FLAG_PHRASE: Readonly<Record<DispatchSuitabilityFlag, string>> = {
  WOULD_INTERRUPT_COMMITTED_WORK: 'se phai bo do viec dang lam',
  CURRENT_LOCATION_AGEING: 'vi tri da cu',
  CURRENT_LOCATION_ACCURACY_LOW: 'do chinh xac vi tri thap',
  NEXT_FREE_PROJECTION_PARTIAL: 'ke hoach con lai chua day du',
  TRUCK_PROFILE_INCOMPLETE: 'chua co kich thuoc/tai trong xe de dinh tuyen dung quy dinh',
  VEHICLE_HAS_OPEN_WORK_ORDER: 'dang co lenh sua mo',
  VEHICLE_RECORDED_STATUS_STALE: 'trang thai luu tren xe da troi',
  VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT: 'vua bao duong vua dang chay',
  VEHICLE_PAYLOAD_UNKNOWN: 'chua biet tai trong cho phep',
};

/** Met -> "12,4 km". Mot chu so thap phan: du de phan biet, khong gia vo chinh xac hon thuc te. */
export const formatKilometres = (metres: number): string => {
  const km = Math.round(metres / 100) / 10;
  return `${km.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
};

/**
 * Giay -> "2 gio 15 phut" / "45 phut".
 *
 * Lam tron den PHUT va khong bao gio hien giay: mot uoc luong duong bo chinh xac den giay la mot
 * loi khai sai ve do tin cay cua chinh no.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phut`;
  if (minutes === 0) return `${hours} gio`;
  return `${hours} gio ${minutes} phut`;
}

export interface CandidateReasonInput {
  readonly mode: DispatchCandidateMode;
  readonly originLabel: string;
  readonly emptyRoadMetresToPickup: number;
  readonly roadSecondsToPickup: number;
  readonly availableAt: string | null;
  readonly availableAtIsLowerBound: boolean;
  readonly nextFree: VehicleNextFree | null;
  readonly flags: readonly DispatchSuitabilityFlag[];
  /** `true` khi con so km/gio la uoc luong tong hop chu chua noi voi nha cung cap nao. */
  readonly synthetic: boolean;
}

/**
 * Mot cau, ba menh de: DI TU DAU, HET BAO NHIEU KM RONG, VA MAT BAO LAU — roi cac dieu can luu y.
 *
 * Thu tu do khong tuy tien: no la dung thu tu ma nguoi dieu xe hoi khi nhin mot dong.
 */
export function describeCandidate(input: CandidateReasonInput): string {
  const parts: string[] = [];

  parts.push(
    `Chay rong ${formatKilometres(input.emptyRoadMetresToPickup)} ${MODE_PHRASE[input.mode]}` +
      ` (${input.originLabel}), mat khoang ${formatDuration(input.roadSecondsToPickup)}`,
  );

  if (input.availableAt !== null && input.mode === 'NEXT_FREE_NEAR') {
    parts.push(
      input.availableAtIsLowerBound
        ? 'xe ranh khong som hon moc du kien'
        : 'xe ranh dung moc du kien',
    );
  }

  if (input.nextFree !== null && input.nextFree.remainingOrderIds.length > 0) {
    parts.push(`con ${input.nextFree.remainingOrderIds.length} don dang cho tren lich`);
  }

  if (input.synthetic) {
    parts.push('con so la uoc luong tong hop, chua qua nha cung cap dinh tuyen');
  }

  for (const flag of input.flags) parts.push(FLAG_PHRASE[flag]);

  return `${parts.join('; ')}.`;
}

/** Cau giai thich cho mot chiec xe KHONG duoc de nghi. Nhan lay tu chinh so tu vung quyet dinh. */
export function describeExclusion(reasons: readonly DispatchCandidateFilterReason[]): string {
  if (reasons.length === 0) return 'Khong de nghi.';
  return `${reasons.map((reason) => decisionReasonLabel(reason)).join('; ')}.`;
}
