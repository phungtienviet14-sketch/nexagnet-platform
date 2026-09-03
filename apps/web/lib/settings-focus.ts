import type { SettingsSectionId } from '../components/settings/settings-composition';
import type {
  CampaignView,
  ReadinessCheckView,
  RuleConfigVersion,
  SettingsGroupSummary,
} from './settings';
import type { OverviewCard } from './settings-overview';

/**
 * Quy tac TIEU DIEM cua `/settings` (#146).
 *
 * Mot man hinh chi duoc co MOT viec dang lam. Module nay tra loi cau "viec dang lam la gi" cho
 * tung muc, tach hoan toan khoi JSX de bo test chay o moi truong node cham toi duoc — cung ly do
 * `settings-composition.ts` khong chua JSX.
 *
 * Khong co quyet dinh NGHIEP VU nao moi o day: moi ham chi SAP XEP LAI su that da co (trang thai
 * nhom, trang thai phien ban rules, trang thai chien dich, cong readiness cua may chu). Neu mot ham
 * o day phai bia ra mot nguong hay mot uu tien khong co trong du lieu, do la dau hieu viec do thuoc
 * backend chu khong thuoc man hinh.
 */

/** Ba muc do noi bat — dung cho ca thanh trang thai gon lan the viec dang lam. */
export type FocusTone = 'ok' | 'attention' | 'blocked';

export interface FocusJob<TSubject = undefined> {
  /** Khoa on dinh cua viec dang lam — doi khoa la doi tieu diem ban phim. */
  readonly key: string;
  readonly title: string;
  /** Tro ngai/tien de ngay truoc mat, viet cho nguoi khong ky thuat. */
  readonly detail: string;
  readonly tone: FocusTone;
  readonly subject: TSubject;
}

/* ------------------------------------------------------------------ Tổng quan */

/**
 * Xep viec dang chan len truoc — theo TAC DONG VAN HANH, khong theo thu tu the duoc dung.
 *
 * Thu tu chi dua tren `status` da co san trong `OverviewCard` (blocked > attention > off > ok) va
 * tren `action`: mot viec khong co nut di toi dau thi khong the la "viec tiep theo", du no dang
 * chan. Khong phat minh do uu tien nghiep vu moi.
 */
const OVERVIEW_STATUS_RANK: Readonly<Record<OverviewCard['status'], number>> = {
  blocked: 0,
  attention: 1,
  off: 2,
  ok: 3,
};

export function rankOverviewWork(cards: readonly OverviewCard[]): readonly OverviewCard[] {
  return [...cards].sort((left, right) => {
    const byStatus = OVERVIEW_STATUS_RANK[left.status] - OVERVIEW_STATUS_RANK[right.status];
    if (byStatus !== 0) return byStatus;
    return Number(Boolean(right.action)) - Number(Boolean(left.action));
  });
}

/** Viec dau tien bam vao lam duoc — the do se la vung noi bat cua man Tong quan. */
export function leadingOverviewWork(outstanding: readonly OverviewCard[]): OverviewCard | undefined {
  const ranked = rankOverviewWork(outstanding);
  return ranked.find((card) => Boolean(card.action)) ?? ranked[0];
}

/* --------------------------------------------------------- Đại lý & nhóm Zalo */

export type GroupJobKind = 'map-group' | 'sync-members' | 'settled';

/**
 * Thu tu viec cua man nhom: `nhom chua map -> chon dai ly -> dong bo thanh vien`.
 *
 * Nhom da go (`ignored`) va nhom khong duoc phep KHONG bao gio la viec dang lam: nguoi van hanh da
 * chu dong dua chung ra khoi luong.
 */
export function resolveGroupJob(
  groups: readonly SettingsGroupSummary[],
): FocusJob<SettingsGroupSummary | null> {
  const live = groups.filter((group) => group.allowed && group.status !== 'ignored');
  const unmapped = live.find((group) => group.status !== 'mapped');
  if (unmapped) {
    return {
      key: `map-group:${unmapped.zcaChatId}`,
      title: `Chọn đại lý cho nhóm “${unmapped.name}”`,
      detail:
        'Tin của nhóm này vẫn được lưu đầy đủ, nhưng chưa tra được giá và chưa lên đơn. Chọn đại lý là chạy ngay.',
      tone: 'blocked',
      subject: unmapped,
    };
  }
  const neverSynced = live.find((group) => group.status === 'mapped' && !group.lastSyncedAt);
  if (neverSynced) {
    return {
      key: `sync-members:${neverSynced.zcaChatId}`,
      title: `Đồng bộ thành viên nhóm “${neverSynced.name}”`,
      detail: 'Nhóm đã có đại lý. Đồng bộ một lần để hệ thống biết ai trong nhóm là người đặt hàng.',
      tone: 'attention',
      subject: neverSynced,
    };
  }
  return {
    key: 'groups-settled',
    title: 'Mọi nhóm đang nghe đều đã có đại lý',
    detail: 'Không còn nhóm nào chờ xử lý. Danh sách bên dưới để tra cứu và chỉnh khi cần.',
    tone: 'ok',
    subject: null,
  };
}

export function groupJobKind(job: FocusJob<SettingsGroupSummary | null>): GroupJobKind {
  if (job.key.startsWith('map-group:')) return 'map-group';
  if (job.key.startsWith('sync-members:')) return 'sync-members';
  return 'settled';
}

/* ------------------------------------------------------- Chính sách bán hàng */

export type PolicyStep = 'summary' | 'draft' | 'review';

export interface PolicyFocus {
  readonly step: PolicyStep;
  readonly title: string;
  readonly detail: string;
  readonly tone: FocusTone;
  /** Nut chinh DUY NHAT cua trang thai hien tai. */
  readonly primaryLabel: string;
  /** Vi sao nut chinh dang khoa — `undefined` nghia la khong khoa. */
  readonly blockedReason?: string;
}

/**
 * `xem ban dang ap dung -> soan ban nhap -> xem truoc -> kich hoat`.
 *
 * KHONG doi ngu nghia cong provisional: `A3/D8/D15` chua chot thi ban nhap van khong kich hoat
 * duoc — o day chi chuyen ly do do ra ngay canh nut, thay vi de o mot the khac tren trang.
 */
export function resolvePolicyFocus(input: {
  readonly editing: boolean;
  readonly previewed: boolean;
  readonly selected?: RuleConfigVersion | undefined;
}): PolicyFocus {
  const { editing, previewed, selected } = input;
  const provisional = selected
    ? !selected.provisionalVerified || selected.provisionalKeys.length > 0
    : false;

  if (editing) {
    return {
      step: 'draft',
      title: 'Soạn bản nháp chính sách',
      detail: 'Nhập các ngưỡng nghiệp vụ rồi lưu lại. Bản nháp chưa ảnh hưởng đơn nào.',
      tone: 'attention',
      primaryLabel: 'Lưu thành bản nháp',
    };
  }
  if (previewed && selected && selected.status !== 'active') {
    return {
      step: 'review',
      title: `Xem lại bản ${selected.version} trước khi áp dụng`,
      detail: provisional
        ? 'Kết quả chạy thử đã có. Còn khoản chưa chốt nên chưa kích hoạt được.'
        : 'Kết quả chạy thử đã có. Kích hoạt là các đơn mới dùng bản này.',
      tone: provisional ? 'blocked' : 'attention',
      primaryLabel: `Kích hoạt bản ${selected.version}`,
      ...(provisional
        ? { blockedReason: 'Cước ship, VAT và phí thu hộ chưa có nguồn chính thức từ khách hàng.' }
        : {}),
    };
  }
  if (selected && selected.status !== 'active') {
    return {
      step: 'summary',
      title: `Chạy thử bản ${selected.version} trên đơn mẫu`,
      detail: 'Chạy thử không ghi đơn nào. Xem kết quả rồi mới quyết định kích hoạt.',
      tone: 'attention',
      primaryLabel: 'Chạy thử trên đơn mẫu',
    };
  }
  return {
    step: 'summary',
    title: 'Chính sách đang áp dụng',
    detail:
      'Muốn đổi ngưỡng thì tạo một bản nháp mới; bản đang chạy giữ nguyên cho tới khi kích hoạt bản khác.',
    tone: 'ok',
    primaryLabel: 'Tạo bản nháp mới',
  };
}

/* ------------------------------------------------------- Chiến dịch chăm sóc */

export interface CampaignAction {
  readonly label: string;
  readonly kind: 'approve' | 'schedule' | 'retry' | 'watch';
}

/**
 * Mot chien dich chi lo ra dung mot hanh dong hop le voi trang thai cua no.
 *
 * Ban cu bay dong thoi `Duyệt nội dung`, hai o lich, `Lên lịch` va `Hủy` mau do rong het chieu
 * ngang — nguoi van hanh phai nho thu tu vong doi moi biet bam cai nao.
 */
export function resolveCampaignAction(status: CampaignView['status']): CampaignAction | null {
  if (status === 'draft') return { label: 'Duyệt nội dung', kind: 'approve' };
  if (status === 'approved') return { label: 'Lên lịch gửi', kind: 'schedule' };
  if (status === 'partially_failed') return { label: 'Gửi lại phần lỗi', kind: 'retry' };
  if (status === 'scheduled' || status === 'running') {
    return { label: 'Theo dõi tiến độ', kind: 'watch' };
  }
  return null;
}

/** Chi chien dich chua ket thuc moi huy duoc — hanh dong pha huy, luon la tertiary. */
export function canCancelCampaign(status: CampaignView['status']): boolean {
  return (
    status === 'draft' || status === 'approved' || status === 'scheduled' || status === 'running'
  );
}

export type CampaignComposeStep = 'compose' | 'targets' | 'review';

/** `Nội dung -> Nhóm nhận -> Xem lại -> Lưu nháp`: buoc dang o dau suy ra tu du lieu da nhap. */
export function resolveComposeStep(input: {
  readonly name: string;
  readonly content: string;
  readonly targetCount: number;
  readonly reviewed: boolean;
}): CampaignComposeStep {
  if (!input.name.trim() || !input.content.trim()) return 'compose';
  if (input.targetCount === 0) return 'targets';
  return input.reviewed ? 'review' : 'targets';
}

/* ---------------------------------------------------------------- Thông báo */

export type NotificationChannel = 'zalo' | 'email';

export interface ChannelFocus {
  readonly title: string;
  readonly detail: string;
  readonly tone: FocusTone;
  readonly primaryLabel: string;
  /** `Gửi thử` chi tro thanh viec tiep theo SAU khi ban ghi hien tai da duoc luu. */
  readonly canTest: boolean;
  readonly testBlockedReason?: string;
}

export function resolveChannelFocus(input: {
  readonly channel: NotificationChannel;
  readonly dirty: boolean;
  readonly connected: boolean;
}): ChannelFocus {
  const { channel, dirty, connected } = input;
  const label = channel === 'zalo' ? 'Zalo' : 'Email';
  if (dirty) {
    return {
      title: `Đang sửa cấu hình ${label}`,
      detail: 'Lưu trước rồi mới gửi thử được — gửi thử luôn dùng cấu hình đã lưu trên máy chủ.',
      tone: 'attention',
      primaryLabel: `Lưu cấu hình ${label}`,
      canTest: false,
      testBlockedReason: 'Còn thay đổi chưa lưu.',
    };
  }
  if (channel === 'zalo' && !connected) {
    return {
      title: 'Kênh Zalo chưa kết nối',
      detail: 'Tài khoản Zalo phụ chưa đăng nhập nên chưa gửi được thông báo qua Zalo.',
      tone: 'blocked',
      primaryLabel: 'Lưu cấu hình Zalo',
      canTest: false,
      testBlockedReason: 'Tài khoản Zalo chưa kết nối.',
    };
  }
  return {
    title: `Cấu hình ${label} đã lưu`,
    detail: 'Gửi thử một lần để chắc chắn người nhận thật sự nhận được.',
    tone: 'ok',
    primaryLabel: `Gửi thử ${label}`,
    canTest: true,
  };
}

/* --------------------------------------------------------------- Kết nối Zalo */

export type ZaloConnectionJob = 'connect' | 'ready';

export function resolveZaloJob(state: string): FocusJob<ZaloConnectionJob> {
  if (state === 'ready') {
    return {
      key: 'zalo-ready',
      title: 'Tài khoản Zalo đang nghe tin',
      detail: 'Hệ thống nhận được tin trong các nhóm được phép. Không cần làm gì thêm.',
      tone: 'ok',
      subject: 'ready',
    };
  }
  const detail =
    state === 'qr_ready' || state === 'qr_scanned'
      ? 'Mã QR đang chờ được quét/xác nhận trên điện thoại có tài khoản Zalo phụ.'
      : 'Chưa có tài khoản nào nghe tin, nên hệ thống không nhận được đơn nào từ Zalo.';
  return {
    key: `zalo-connect:${state}`,
    title: 'Cần kết nối lại tài khoản Zalo',
    detail,
    tone: 'blocked',
    subject: 'connect',
  };
}

/* ------------------------------------------------------- Trạng thái hệ thống */

/**
 * Cong readiness nao sua duoc o muc nao — dung DUNG cac muc da co, khong tao dieu huong moi.
 *
 * Khoa khong nam trong bang thi khong co nut di toi: mot nut dan sai cho con te hon khong co nut.
 */
const READINESS_SECTION: Readonly<Record<string, SettingsSectionId>> = {
  'price.current_period': 'products-pricing',
  'price.periods': 'products-pricing',
  'products.configured': 'products-pricing',
  'groups.mapped': 'dealers-groups',
  'dealers.configured': 'dealers-groups',
  'participants.classified': 'dealers-groups',
  'rules.active': 'sales-policy',
  'knowledge.content': 'content',
  'channel.listener': 'zalo',
  'channel.zca': 'zalo',
  'automation.auto_send': 'automation',
};

export function readinessCheckSection(key: string): SettingsSectionId | undefined {
  return READINESS_SECTION[key];
}

export interface ReadinessFocus {
  readonly tone: FocusTone;
  readonly title: string;
  readonly detail: string;
  readonly blocking: readonly ReadinessCheckView[];
  readonly informational: readonly ReadinessCheckView[];
  readonly open: readonly ReadinessCheckView[];
}

export function resolveReadinessFocus(input: {
  readonly checks: readonly ReadinessCheckView[];
  readonly goLiveReady: boolean;
}): ReadinessFocus {
  const blocking = input.checks.filter((check) => check.blocking);
  const informational = input.checks.filter((check) => !check.blocking);
  const open = blocking.filter((check) => check.status !== 'ready');
  if (input.goLiveReady || open.length === 0) {
    return {
      tone: 'ok',
      title: 'Đủ điều kiện chạy thật',
      detail: 'Mọi điều kiện bắt buộc đã đạt. Danh sách bên dưới để tra cứu lại khi cần.',
      blocking,
      informational,
      open,
    };
  }
  return {
    tone: 'blocked',
    title: `Còn ${open.length} điều kiện bắt buộc chưa đạt`,
    detail: 'Xử lý lần lượt từ trên xuống; mỗi việc có đường dẫn thẳng tới màn sửa được nó.',
    blocking,
    informational,
    open,
  };
}

/* ------------------------------------------------ Người dùng & phân quyền */

export type UserRisk = 'routine' | 'sensitive' | 'destructive';

/** Nhom thao tac tai khoan theo RUI RO, de chung khong bao gio la ba cai nut ngang hang. */
export function userActionRisk(action: 'role' | 'reset-password' | 'disable'): UserRisk {
  if (action === 'role') return 'routine';
  if (action === 'reset-password') return 'sensitive';
  return 'destructive';
}

/* ------------------------------------------------------- Lịch sử thay đổi */

export interface AuditFilterSummary {
  readonly active: boolean;
  readonly label: string;
}

/** Tom tat bo loc dang ap dung — de ket qua rong khong bi doc nham la "khong co du lieu". */
export function summarizeAuditFilters(filters: {
  readonly actor?: string | undefined;
  readonly entityType?: string | undefined;
  readonly action?: string | undefined;
}): AuditFilterSummary {
  const parts: string[] = [];
  if (filters.actor) parts.push(`người thao tác “${filters.actor}”`);
  if (filters.entityType) parts.push(`đối tượng “${filters.entityType}”`);
  if (filters.action) parts.push(`hành động “${filters.action}”`);
  if (parts.length === 0) return { active: false, label: 'Đang xem toàn bộ lịch sử' };
  return { active: true, label: `Đang lọc theo ${parts.join(' · ')}` };
}
