import type {
  SiteCandidateView,
  SiteIntakeLocationTrust,
  SiteIntakeLocationUnusableReason,
  SiteIntakeOpenRunView,
  SiteIntakeProposal,
} from '../transport-types';

/**
 * MAN HINH NHAN VIEC TAI DIA DIEM A — `#267` H6.
 *
 * ============================================================================================
 * HAM THUAN, VA DO LA CA LY DO NO O DAY CHU KHONG TRONG COMPONENT
 * ============================================================================================
 *
 * Man hinh nay quyet dinh MOT dieu: lai xe nhin thay nut gi. Ba lua chon, loai tru nhau:
 *
 *   `Tao chuyen`        — dung mot dia diem, chac chan, va chua co chuyen nao chua ket thuc;
 *   chon trong danh sach — nhieu dia diem hop ly, hoac mot dia diem chi "co the";
 *   `Ghi nhan da den`   — da co chuyen chua ket thuc.
 *
 * Neu ba nhanh do song trong JSX thi sau ba lan sua giao dien khong ai con doc lai duoc rang
 * *"khong bao gio tu tao chuyen"* van dung. O day chung la mot bang, va bang do co bai kiem.
 */

export type SiteIntakeMode = 'CONFIRM' | 'CHOOSE' | 'ACTIVE_RUN' | 'NO_MATCH' | 'LOCATION_UNUSABLE';

export interface SiteCandidateRow {
  readonly siteId: string;
  /** Dong tren cua the — TEN PHAP NHAN. `#267` H6 in ra hai dong. */
  readonly companyLine: string;
  /** Dong duoi — TEN CHO. */
  readonly siteLine: string;
  readonly addressLine: string | null;
  readonly distanceLine: string;
  /** `true` khi sai so cua thiet bi phu len duong bien — "co the", khong "chac chan". */
  readonly uncertain: boolean;
  /**
   * LUON `false`. `#267` H6: *"Never show a random first candidate as selected truth."*
   *
   * Truong nay ton tai de dieu do la mot KHANG DINH doc duoc chu khong phai mot su vang mat — mot
   * `checked` them vao JSX sau nay se phai di qua day.
   */
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

/**
 * Vi tri khong dung duoc phai doc ra KHAC "khong tim thay".
 *
 * Gop hai thu se noi *"khong nhan ra kho nao"* trong khi su that la *"may chua bat dinh vi xong"* —
 * va lai xe se di tim mot cai nut khong ton tai. Moi ma mot cau, va moi cau noi ro viec PHAI LAM.
 */
export const SITE_INTAKE_LOCATION_HINTS: Readonly<
  Record<SiteIntakeLocationUnusableReason, string>
> = {
  COORDINATE_INVALID: 'Máy chưa đọc được vị trí. Bật định vị rồi thử lại, hoặc chọn nơi bằng tay.',
  ACCURACY_UNUSABLE:
    'Định vị đang quá thô để phân biệt hai kho cạnh nhau. Ra chỗ thoáng vài giây rồi thử lại.',
  LOCATION_STALE:
    'Vị trí này là của lúc trước, không phải bây giờ. Chờ máy lấy lại định vị rồi thử lại.',
};

const TRUST_LABELS: Readonly<Record<SiteIntakeLocationTrust, string>> = {
  SERVER_BOUND: 'Vị trí đã xác thực',
  DRIVER_REPORTED: 'Vị trí do máy bạn báo',
};

/**
 * Khoang cach cho NGUOI doc, khong phai mot so tho.
 *
 * Duoi 1 km thi don vi met noi duoc nhieu hon ("cach 42 m" — di bo toi duoc); tu 1 km tro len thi
 * met tro thanh mot chuoi chu so ma khong ai uoc luong duoc.
 */
function distanceLine(metres: number): string {
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

/**
 * THU TU KIEM LA MOT PHAN CUA HOP DONG.
 *
 * `ACTIVE_RUN` di TRUOC moi nhanh khac, ke ca truoc `UNIQUE`. `#267` H3: da co chuyen chua ket thuc
 * thi cau tra loi dung la *"ghi nhan vao chuyen do"*, khong phai *"tao chuyen"* — va no dung ke ca
 * khi vi tri nhan ra chinh xac mot kho. Dao thu tu se cho ra mot man hinh moi bam mot nut ma may
 * chu se tu choi.
 */
export function toSiteIntakeScreen(proposal: SiteIntakeProposal): SiteIntakeScreen {
  const candidates = proposal.candidates.map(toRow);
  const trustLabel = TRUST_LABELS[proposal.locationTrust];

  if (proposal.openRuns.length > 0) {
    return {
      mode: 'ACTIVE_RUN',
      headline: candidates.length > 0 ? 'Bạn đang ở' : 'Chuyến hiện tại của bạn',
      candidates,
      openRuns: proposal.openRuns,
      primaryLabel: 'Ghi nhận đã đến / chụp giấy vào',
      secondaryLabel: null,
      notice: null,
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
      notice:
        proposal.locationUnusable === null
          ? SITE_INTAKE_LOCATION_HINTS.COORDINATE_INVALID
          : SITE_INTAKE_LOCATION_HINTS[proposal.locationUnusable],
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
      primaryLabel: 'Tạo chuyến',
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
    primaryLabel: 'Tạo chuyến',
    secondaryLabel: 'Không phải nơi nào ở trên',
    notice: proposal.truncated
      ? 'Quanh đây còn nơi khác nữa — nếu không thấy đúng nơi, báo văn phòng.'
      : null,
    trustLabel,
    canCreate: proposal.canCreate,
  };
}
