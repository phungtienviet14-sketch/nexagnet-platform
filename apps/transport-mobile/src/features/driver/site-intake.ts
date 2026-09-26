import type {
  SiteCandidateView,
  SiteIntakeLocationInput,
  SiteIntakeLocationTrust,
  SiteIntakeLocationUnusableReason,
  SiteIntakeOpenRunView,
  SiteIntakeProposal,
  SiteIntakeResult,
} from './types';

/**
 * NHAN VIEC TAI DIA DIEM — port THUAN cua web `workspace/site-intake.ts` (`#267` H6).
 *
 * Man hinh quyet dinh MOT dieu: lai xe thay nut gi. Nam nhanh, LOAI TRU nhau, va THU TU KIEM la
 * mot phan cua hop dong: da co chuyen chua ket thuc (`ACTIVE_RUN`) thang MOI nhanh khac, ke ca khi
 * vi tri nhan ra dung mot kho — cau tra loi dung la "ghi vao chuyen do", khong phai "tao chuyen".
 *
 * KHONG ung vien nao duoc chon san (`preselected: false`): `#267` H6 cam coi ung vien dau tien la
 * su that.
 */
export type SiteIntakeMode = 'CONFIRM' | 'CHOOSE' | 'ACTIVE_RUN' | 'NO_MATCH' | 'LOCATION_UNUSABLE';

export interface SiteCandidateRow {
  readonly siteId: string;
  readonly companyLine: string;
  readonly siteLine: string;
  readonly addressLine: string | null;
  readonly distanceLine: string;
  readonly uncertain: boolean;
  readonly preselected: false;
}

export interface SiteIntakeScreen {
  readonly mode: SiteIntakeMode;
  readonly headline: string;
  readonly candidates: readonly SiteCandidateRow[];
  readonly openRuns: readonly SiteIntakeOpenRunView[];
  readonly primaryLabel: string | null;
  readonly secondaryLabel: string | null;
  readonly notice: string | null;
  readonly trustLabel: string;
  readonly canCreate: boolean;
}

/** Vi tri khong dung duoc phai doc ra KHAC "khong tim thay" — moi ma mot viec phai lam. */
export const SITE_INTAKE_LOCATION_HINTS: Readonly<
  Record<SiteIntakeLocationUnusableReason, string>
> = {
  COORDINATE_INVALID: 'Máy chưa đọc được vị trí. Bật định vị rồi thử lại.',
  ACCURACY_UNUSABLE:
    'Định vị đang quá thô để phân biệt hai kho cạnh nhau. Ra chỗ thoáng vài giây rồi thử lại.',
  LOCATION_STALE:
    'Vị trí này là của lúc trước, không phải bây giờ. Chờ máy lấy lại định vị rồi thử lại.',
};

/**
 * CHU DUOC DUYET cho lai xe (`#398` OWNER UI OVERRIDE): khong "Tạo chuyến", khong "đơn", khong "vòng
 * chạy". Lai xe NHAN mot chuyen o noi minh dang dung — phan con lai la viec cua he thong.
 */
export const SITE_INTAKE_CONFIRM_LABEL = 'Nhận chuyến tại đây';
export const ACTIVE_RUN_NOTICE = 'Bạn đang có chuyến chưa xong — ghi nhận vào chuyến đó';
export const ACTIVE_RUN_BACK_LABEL = 'Về màn Việc';

const TRUST_LABELS: Readonly<Record<SiteIntakeLocationTrust, string>> = {
  SERVER_BOUND: 'Vị trí đã xác thực',
  DRIVER_REPORTED: 'Vị trí do máy bạn báo',
};

export function distanceLine(metres: number): string {
  if (!Number.isFinite(metres)) return 'chưa rõ khoảng cách';
  if (metres < 1_000) return `cách ${Math.round(metres)} m`;
  return `cách ${(metres / 1_000).toFixed(1).replace('.', ',')} km`;
}

const toRow = (candidate: SiteCandidateView): SiteCandidateRow => ({
  siteId: candidate.siteId,
  companyLine: candidate.counterpartyName,
  siteLine: candidate.siteName,
  addressLine: candidate.address,
  distanceLine: distanceLine(candidate.distanceMetres),
  uncertain: candidate.confidence === 'NEAR',
  preselected: false,
});

export function toSiteIntakeScreen(proposal: SiteIntakeProposal): SiteIntakeScreen {
  const candidates = proposal.candidates.map(toRow);
  const trustLabel = TRUST_LABELS[proposal.locationTrust] ?? proposal.locationTrust;

  if (proposal.openRuns.length > 0) {
    return {
      mode: 'ACTIVE_RUN',
      headline: candidates.length > 0 ? 'Bạn đang ở' : 'Chuyến hiện tại của bạn',
      candidates,
      openRuns: proposal.openRuns,
      primaryLabel: ACTIVE_RUN_BACK_LABEL,
      secondaryLabel: null,
      notice: ACTIVE_RUN_NOTICE,
      trustLabel,
      canCreate: false,
    };
  }
  if (proposal.outcome === 'LOCATION_UNUSABLE') {
    return {
      mode: 'LOCATION_UNUSABLE',
      headline: 'Chưa dùng được vị trí hiện tại',
      candidates: [],
      openRuns: [],
      primaryLabel: null,
      secondaryLabel: 'Thử lại',
      notice: SITE_INTAKE_LOCATION_HINTS[proposal.locationUnusable ?? 'COORDINATE_INVALID'],
      trustLabel,
      canCreate: false,
    };
  }
  if (candidates.length === 0) {
    return {
      mode: 'NO_MATCH',
      headline: 'Không nhận ra nơi nào quanh đây',
      candidates: [],
      openRuns: [],
      primaryLabel: null,
      secondaryLabel: 'Thử lại',
      notice: 'Chưa có kho nào được khai hàng rào quanh vị trí này. Báo văn phòng để khai thêm.',
      trustLabel,
      canCreate: false,
    };
  }
  const only = candidates[0];
  if (proposal.outcome === 'UNIQUE' && candidates.length === 1 && only !== undefined) {
    return {
      mode: 'CONFIRM',
      headline: 'Bạn đang ở',
      candidates: [only],
      openRuns: [],
      primaryLabel: SITE_INTAKE_CONFIRM_LABEL,
      secondaryLabel: 'Không phải địa điểm này',
      notice: null,
      trustLabel,
      canCreate: proposal.canCreate,
    };
  }
  return {
    mode: 'CHOOSE',
    headline: 'Bạn đang ở gần mấy nơi — chọn đúng nơi bạn đang đứng',
    candidates,
    openRuns: [],
    primaryLabel: SITE_INTAKE_CONFIRM_LABEL,
    secondaryLabel: 'Không phải nơi nào ở trên',
    notice: proposal.truncated
      ? 'Quanh đây còn nơi khác nữa — nếu không thấy đúng nơi, báo văn phòng.'
      : null,
    trustLabel,
    canCreate: proposal.canCreate,
  };
}

/** Kho SE TAO chuyen: CONFIRM thi la kho duy nhat; CHOOSE thi CHI kho lai xe tu chon. */
export function intakeTarget(screen: SiteIntakeScreen, chosenSiteId: string | null): string | null {
  if (screen.mode === 'CHOOSE') {
    return screen.candidates.some((row) => row.siteId === chosenSiteId) ? chosenSiteId : null;
  }
  if (screen.mode === 'CONFIRM') return screen.candidates[0]?.siteId ?? null;
  return null;
}

/**
 * Vi tri gui kem: toa do CA HAI hoac KHONG GI CA (may chu tu choi mot nua). Toa do hong/Null
 * Island -> gui rong, de may chu noi `LOCATION_UNUSABLE` thay vi ta doan.
 */
export function siteLocationInput(
  fix: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracyMetres: number | null;
  } | null,
): SiteIntakeLocationInput {
  if (fix === null) return {};
  const { latitude, longitude } = fix;
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(Math.abs(latitude) < 1e-9 && Math.abs(longitude) < 1e-9);
  if (!valid) return {};
  const accuracy =
    fix.accuracyMetres !== null && Number.isFinite(fix.accuracyMetres) && fix.accuracyMetres >= 0
      ? Math.min(fix.accuracyMetres, 100_000)
      : null;
  return { latitude, longitude, accuracyMetres: accuracy };
}

/** Cau ket qua — NOI THAT ve cai chua biet va ve do tin cua vi tri (web, nguyen chu). */
export function intakeResultLines(result: SiteIntakeResult): {
  readonly destination: string;
  readonly trust: string;
  readonly replay: string | null;
} {
  return {
    destination: result.destinationPending ? 'Chưa xác định — văn phòng bổ sung sau' : '—',
    trust:
      result.locationTrust === 'SERVER_BOUND'
        ? 'Đã xác thực'
        : 'Do máy bạn báo — chưa có bản định vị làm chứng',
    replay: result.replayed
      ? 'Lần bấm này gửi lại đúng lệnh cũ — không có chuyến thứ hai nào được tạo.'
      : null,
  };
}
