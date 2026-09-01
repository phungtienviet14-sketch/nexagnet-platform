import type { SettingsSectionId } from '../components/settings/settings-composition';
import type { PricePeriodBoard } from './price-period-view';
import type { BlockedCapabilityDescriptor } from './tenant-runtime';
import type { ReadinessView, SettingsSummary } from './settings';

/**
 * Man dau cua `/settings` phai tra loi ba cau trong muoi giay: he thong co chay khong, co gi dang
 * chan ban hang, va toi phai lam gi tiep (#117 §3).
 *
 * Ban cu tra loi ca ba bang mot bang `Sẵn sàng vận hành` in nguyen ma ly do cua may:
 * `missing_current_price_period`, `channel_not_production_ready:zca`. Doc duoc ma do la mot ky
 * nang ky thuat, va no lai con khong noi PHAI LAM GI. O day moi the la mot cau tieng Viet + dung
 * MOT viec de bam, con ma goc lui ve phan chi tiet ky thuat.
 */

export type OverviewCardStatus = 'ok' | 'attention' | 'blocked' | 'off';

export interface OverviewAction {
  readonly label: string;
  readonly section: SettingsSectionId;
}

export interface OverviewCard {
  readonly key: string;
  readonly title: string;
  readonly status: OverviewCardStatus;
  readonly detail: string;
  readonly action?: OverviewAction;
  /** Ma goc cua may — chi hien trong phan "Chi tiết kỹ thuật", khong bao gio o mat truoc. */
  readonly technicalDetail?: string;
}

const CHANNEL_LABELS: Readonly<Record<SettingsSummary['channelMode'], string>> = {
  mock: 'Chạy ngoại tuyến (không nối Zalo thật)',
  bot: 'Tài khoản bot Zalo',
  zca: 'Tài khoản Zalo cá nhân',
  hybrid: 'Hai kênh Zalo cùng lúc',
};

/**
 * Ma ly do cua cong san sang -> mot cau tieng Viet + noi ve dau ma sua.
 *
 * Chi anh xa nhung muc khach TU LAM DUOC. Muc ha tang (`media.production`, `auth.production`, …)
 * co y khong co hanh dong: dua cho khach mot cai nut khong sua duoc gi con te hon la khong dua.
 */
const READINESS_COPY: Readonly<
  Record<
    string,
    { readonly title: string; readonly detail: string; readonly action?: OverviewAction }
  >
> = {
  'price.current_period': {
    title: 'Bảng giá tháng này',
    detail:
      'Chưa có bảng giá chính thức cho tháng hiện tại nên hệ thống chưa báo giá tự động được.',
    action: { label: 'Thiết lập bảng giá', section: 'products-pricing' },
  },
  'dealers.configured': {
    title: 'Danh sách đại lý',
    detail: 'Chưa khai đại lý nào, nên chưa áp được chính sách giá và công nợ.',
    action: { label: 'Khai đại lý', section: 'dealers-groups' },
  },
  'groups.mapped': {
    title: 'Nhóm Zalo và đại lý',
    detail: 'Chưa nhóm nào được gán cho đại lý, nên tin trong nhóm chưa biết thuộc về ai.',
    action: { label: 'Gán đại lý cho nhóm', section: 'dealers-groups' },
  },
  'channel.production': {
    title: 'Kênh nhận tin',
    detail: 'Kênh Zalo chưa sẵn sàng để chạy thật.',
    action: { label: 'Kiểm tra kết nối Zalo', section: 'zalo' },
  },
};

export interface OverviewInput {
  readonly summary: SettingsSummary;
  readonly board: PricePeriodBoard | null;
  readonly readiness: ReadinessView | null;
  readonly blockedCapabilities: readonly BlockedCapabilityDescriptor[];
  readonly canConfigure: boolean;
  readonly rbacEnforced: boolean;
}

/**
 * Xay danh sach the trang thai. Thu tu: viec dang chan truoc, viec on sau — mat doc tu tren xuong
 * nen viec can lam phai o tren.
 */
export function buildOverviewCards(input: OverviewInput): readonly OverviewCard[] {
  const cards: OverviewCard[] = [];
  const { summary, board, readiness } = input;

  const zaloReady = summary.zcaState === 'ready';
  cards.push({
    key: 'channel',
    title: 'Kết nối Zalo',
    status: zaloReady ? 'ok' : 'attention',
    detail: zaloReady
      ? `Đã kết nối · ${CHANNEL_LABELS[summary.channelMode]}. Hệ thống đang nghe tin trong nhóm.`
      : `Chưa nghe được tin nhắn · ${CHANNEL_LABELS[summary.channelMode]}.`,
    ...(zaloReady ? {} : { action: { label: 'Kiểm tra kết nối Zalo', section: 'zalo' as const } }),
  });

  if (board) {
    const monthLabel = formatMonth(board.currentMonth);
    if (board.official) {
      cards.push({
        key: 'price',
        title: `Bảng giá ${monthLabel}`,
        status: 'ok',
        detail: `Đang áp dụng bảng giá chính thức với ${board.official.prices.length} mặt hàng.`,
        action: { label: 'Xem bảng giá', section: 'products-pricing' },
      });
    } else {
      cards.push({
        key: 'price',
        title: `Bảng giá ${monthLabel}`,
        status: 'blocked',
        detail: board.testOnly
          ? 'Chưa có bảng giá chính thức. Hiện chỉ có một bảng giá để chạy thử, nên đơn thật vẫn được chuyển về cho Sale.'
          : 'Chưa có bảng giá chính thức, nên mọi câu hỏi giá và đơn hàng đều chuyển về cho Sale xử lý tay.',
        action: { label: 'Thiết lập bảng giá', section: 'products-pricing' },
      });
    }
  }

  const unmappedGroups = summary.groups.filter(
    (group) => group.allowed && group.status === 'pending',
  ).length;
  if (unmappedGroups > 0) {
    cards.push({
      key: 'groups',
      title: `${unmappedGroups} nhóm chưa gán đại lý`,
      status: 'attention',
      detail:
        'Tin nhắn trong các nhóm này chưa biết thuộc đại lý nào, nên chưa áp được đúng giá và chính sách.',
      action: { label: 'Gán đại lý', section: 'dealers-groups' },
    });
  }

  const autoSendOn = summary.autoSend;
  cards.push({
    key: 'auto-send',
    title: 'Tự động gửi xác nhận',
    status: autoSendOn ? 'ok' : 'off',
    detail: autoSendOn
      ? `Đang bật. Đơn đủ dữ liệu và không quá ${summary.orderAutomation?.maxAutoConfirmQuantity ?? '—'} sản phẩm được gửi xác nhận ngay.`
      : 'Đang tắt. Mọi đơn đều chờ Sale duyệt trước khi gửi — đây là trạng thái an toàn.',
    action: { label: 'Xem cài đặt tự động hóa', section: 'automation' },
  });

  for (const capability of input.blockedCapabilities) {
    cards.push({
      key: `blocked:${capability.key}`,
      title: `${capability.label}: chưa sẵn sàng`,
      status: 'blocked',
      detail: capability.reason,
      action: { label: 'Xem dữ liệu còn thiếu', section: 'system-status' },
    });
  }

  if (readiness) {
    for (const check of readiness.checks) {
      if (!check.blocking || check.status === 'ready') continue;
      // Bang gia va nhom da co the rieng o tren — khong noi hai lan cung mot viec.
      if (check.key === 'price.current_period' && board) continue;
      const copy = READINESS_COPY[check.key];
      if (!copy) continue;
      cards.push({
        key: `readiness:${check.key}`,
        title: copy.title,
        status: 'attention',
        detail: copy.detail,
        ...(copy.action ? { action: copy.action } : {}),
        technicalDetail: `${check.key} = ${check.detail}`,
      });
    }
  }

  if (!input.rbacEnforced) {
    cards.push({
      key: 'rbac',
      title: 'Phân quyền đang tắt',
      status: 'attention',
      detail:
        'Máy chủ đang không kiểm tra quyền, nên ai mở được màn hình này cũng sửa được cấu hình. Bật đăng nhập trước khi chạy thật.',
      action: { label: 'Xem việc còn thiếu', section: 'system-status' },
      technicalDetail: 'AUTH_MODE != session',
    });
  }

  return sortCards(cards);
}

const STATUS_WEIGHT: Readonly<Record<OverviewCardStatus, number>> = {
  blocked: 0,
  attention: 1,
  off: 2,
  ok: 3,
};

function sortCards(cards: readonly OverviewCard[]): readonly OverviewCard[] {
  return [...cards].sort((left, right) => STATUS_WEIGHT[left.status] - STATUS_WEIGHT[right.status]);
}

/** Viec CON PHAI LAM — chinh la phan khach can thay dau tien. */
export function outstandingWork(cards: readonly OverviewCard[]): readonly OverviewCard[] {
  return cards.filter((card) => card.status === 'blocked' || card.status === 'attention');
}

export interface OverviewHeadline {
  readonly tone: 'ok' | 'attention' | 'blocked';
  readonly title: string;
  readonly detail: string;
}

/** Mot cau tra loi cho "he thong co dang hoat dong khong" — khong bat doc ca bang moi biet. */
export function overviewHeadline(cards: readonly OverviewCard[]): OverviewHeadline {
  const outstanding = outstandingWork(cards);
  const blocked = outstanding.filter((card) => card.status === 'blocked');
  if (blocked.length > 0) {
    return {
      tone: 'blocked',
      title: `Có ${blocked.length} việc đang chặn bán hàng`,
      detail: 'Hệ thống vẫn nhận tin, nhưng những việc dưới đây làm đơn phải chuyển về cho Sale.',
    };
  }
  if (outstanding.length > 0) {
    return {
      tone: 'attention',
      title: `Còn ${outstanding.length} việc cần hoàn thiện`,
      detail: 'Hệ thống đang bán hàng được. Hoàn thiện các mục dưới đây để chạy trơn hơn.',
    };
  }
  return {
    tone: 'ok',
    title: 'Hệ thống đang hoạt động bình thường',
    detail: 'Không có việc nào đang chờ bạn xử lý.',
  };
}

/** `2026-09` -> `tháng 09/2026`. Chuoi la khong doan bua — tra ve nguyen van. */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `tháng ${match[2]}/${match[1]}`;
}
