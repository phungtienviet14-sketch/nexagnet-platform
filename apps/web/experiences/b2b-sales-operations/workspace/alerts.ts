import type { OrderView } from '@netviet/shared';
import type { Availability, ChannelMode, ReadinessCheckView } from '../../../lib/settings';
import type { BlockedCapabilityDescriptor } from '../../../lib/tenant-runtime';
import type { B2bSectionId } from '../navigation';
import { toCustomerOrderDetail, type CustomerOrderDetail } from './order-detail';

/**
 * CANH BAO HUONG KHACH — chi tu tin hieu DA CO (Issue #110 §Cảnh báo).
 *
 * Quy tac nghiem ngat cua muc nay: MOI dong phai truy nguoc duoc ve mot nguon that dang chay.
 * Khong diem tin cay, khong diem rui ro, khong cam ket SLA — nen tang khong do nhung thu do, va
 * mot con so bia dat canh mot con so that lam ca bang mat gia tri.
 *
 * Nam nhom, va ca nam deu la CONG VIEC chu khong phai trang thai may moc:
 *
 *   - `can_duyet`          — don dang cho nguoi bam gui
 *   - `can_nhap_don`       — don da gui, cho go vao phan mem ban hang
 *   - `don_can_kiem_tra`   — don DA GUI ma van con canh bao khong ai xem lai
 *   - `du_lieu_chinh_sach` — nghiep vu khach khai la chua san sang + cong go-live chua dat
 *   - `ket_noi_kenh`       — kenh doc/gui dang khong o trang thai binh thuong
 *
 * Nhom thu ba ton tai vi mot ly do rat cu the cua GĐ1: don trong nguong duoc TU DONG gui (xem
 * CLAUDE.md, quyet dinh kien truc #4). Mot don tu gui kem canh bao gia la don khong nguoi nao
 * tung doc — neu bang canh bao khong keu, se khong co gi keu ca.
 */

export const ALERT_CATEGORIES = [
  'can_duyet',
  'can_nhap_don',
  'don_can_kiem_tra',
  'du_lieu_chinh_sach',
  'ket_noi_kenh',
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const ALERT_CATEGORY_LABEL: Readonly<Record<AlertCategory, string>> = {
  can_duyet: 'Cần duyệt',
  can_nhap_don: 'Cần nhập đơn',
  don_can_kiem_tra: 'Đơn cần kiểm tra lại',
  du_lieu_chinh_sach: 'Dữ liệu / chính sách chưa sẵn sàng',
  ket_noi_kenh: 'Kết nối / kênh cần chú ý',
};

/** Duong di toi cho lam viec do. `null` khi nen tang CHUA co man hinh nao de lam viec do. */
export interface AlertLink {
  readonly section: B2bSectionId;
  readonly selection: string | null;
  readonly label: string;
}

export interface CustomerAlert {
  readonly id: string;
  readonly category: AlertCategory;
  readonly title: string;
  readonly detail: string;
  /** Cau canh bao nguyen van cua rules engine, neu co. */
  readonly notes: readonly string[];
  /** Thoi diem lam moc xep hang; `null` khi tin hieu khong gan voi mot thoi diem nao. */
  readonly at: string | null;
  readonly link: AlertLink | null;
}

export interface ChannelSignal {
  readonly availability: Availability;
  readonly channelMode: ChannelMode;
  /** Trang thai phien doc Zalo ca nhan: ready / connecting / error / logged_out / unavailable. */
  readonly zcaState: string;
}

export interface AlertSources {
  readonly orders: readonly OrderView[];
  readonly blockedCapabilities: readonly BlockedCapabilityDescriptor[];
  /** `null` khi CHUA DOC DUOC cong go-live — khac han voi "da doc va khong con gi". */
  readonly readinessChecks: readonly ReadinessCheckView[] | null;
  readonly channel: ChannelSignal | null;
}

const CATEGORY_ORDER: Readonly<Record<AlertCategory, number>> = {
  can_duyet: 0,
  can_nhap_don: 1,
  don_can_kiem_tra: 2,
  du_lieu_chinh_sach: 3,
  ket_noi_kenh: 4,
};

function orderAlert(
  order: CustomerOrderDetail,
  category: AlertCategory,
  detail: string,
  link: AlertLink,
): CustomerAlert {
  return {
    id: `${category}:${order.reference}`,
    category,
    title: order.dealerName ?? order.groupName ?? 'Chưa xác định đại lý',
    detail,
    notes: order.attentionNotes,
    at: order.receivedAt,
    link,
  };
}

function fromOrders(orders: readonly OrderView[]): readonly CustomerAlert[] {
  return orders.map(toCustomerOrderDetail).flatMap((order) => {
    if (order.stage === 'cho_duyet') {
      return [
        orderAlert(order, 'can_duyet', 'Đang chờ người duyệt trước khi gửi vào nhóm.', {
          section: 'approvals',
          selection: order.reference,
          label: 'Mở để duyệt',
        }),
      ];
    }
    if (order.stage === 'cho_nhap_don') {
      return [
        orderAlert(
          order,
          'can_nhap_don',
          'Đã gửi xác nhận cho nhóm; còn chờ nhập vào phần mềm bán hàng.',
          { section: 'orders', selection: order.reference, label: 'Mở đơn' },
        ),
      ];
    }
    // Chi don DA GUI XONG ma van con canh bao. Don da huy thi khong con viec gi, con don dang nam
    // o hai hang cho tren thi da duoc keu roi — keu lan hai chi lam bang canh bao dem trung.
    if (order.stage === 'da_gui' && order.attentionNotes.length > 0) {
      return [
        orderAlert(
          order,
          'don_can_kiem_tra',
          'Đơn đã gửi cho nhóm nhưng vẫn còn cảnh báo chưa ai xem lại.',
          { section: 'orders', selection: order.reference, label: 'Mở đơn' },
        ),
      ];
    }
    return [];
  });
}

function fromBlockedCapabilities(
  blocked: readonly BlockedCapabilityDescriptor[],
): readonly CustomerAlert[] {
  return blocked.map((capability) => ({
    id: `du_lieu_chinh_sach:tenant:${capability.key}`,
    category: 'du_lieu_chinh_sach' as const,
    title: capability.label,
    detail: capability.reason,
    notes: [],
    at: null,
    link: null,
  }));
}

/**
 * Cong go-live: chi lay dieu kien BAT BUOC va CHUA DAT.
 *
 * Dieu kien khong bat buoc van doc duoc o trang Cài đặt; dua no vao day chi lam bang canh bao dai
 * them bang nhung dong khong chan ai — va mot bang canh bao khong bao gio bo trong duoc thi khong
 * ai doc nua.
 */
function fromReadinessChecks(
  checks: readonly ReadinessCheckView[] | null,
): readonly CustomerAlert[] {
  if (checks === null) return [];
  return checks
    .filter((check) => check.blocking && check.status !== 'ready')
    .map((check) => ({
      id: `du_lieu_chinh_sach:golive:${check.key}`,
      category: 'du_lieu_chinh_sach' as const,
      title: check.label,
      detail: check.detail,
      notes: [],
      at: null,
      link: null,
    }));
}

const HEALTHY_ZCA_STATES: readonly string[] = ['ready', 'connecting'];

/**
 * Kenh doc/gui co dang binh thuong khong.
 *
 * `mock` KHONG bi bao dong: do la che do chay khong ket noi, duoc dung co chu dich khi demo va
 * khi chay CI. Bao dong o day se day mot dong do vinh vien len man hinh cua moi lan chay thu —
 * va mot canh bao luon bat thi khong con la canh bao.
 */
function fromChannel(channel: ChannelSignal | null): readonly CustomerAlert[] {
  if (!channel) return [];
  const alerts: CustomerAlert[] = [];

  if (channel.availability !== 'available') {
    alerts.push({
      id: 'ket_noi_kenh:availability',
      category: 'ket_noi_kenh',
      title: 'Chưa đọc được đầy đủ cấu hình vận hành',
      detail:
        channel.availability === 'unavailable'
          ? 'Hệ thống chưa kết nối được tới máy chủ cấu hình. Số liệu trên màn hình có thể chưa mới nhất.'
          : 'Đang hiển thị cấu hình từ nguồn dự phòng; một vài thông tin có thể chưa cập nhật.',
      notes: [],
      at: null,
      link: { section: 'settings', selection: null, label: 'Xem cài đặt' },
    });
  }

  if (
    (channel.channelMode === 'zca' || channel.channelMode === 'hybrid') &&
    !HEALTHY_ZCA_STATES.includes(channel.zcaState)
  ) {
    alerts.push({
      id: 'ket_noi_kenh:zca',
      category: 'ket_noi_kenh',
      title: 'Kênh đọc tin nhắn nhóm đang không hoạt động',
      detail:
        'Hệ thống hiện không nhận được tin mới từ các nhóm Zalo. Cần đăng nhập lại kênh trước khi tin nhắn được xử lý tự động.',
      notes: [],
      at: null,
      link: { section: 'settings', selection: null, label: 'Mở cài đặt kênh' },
    });
  }

  return alerts;
}

/**
 * TAT DINH: cung mot bo nguon cho ra cung mot danh sach, cung mot thu tu.
 *
 * Xep theo nhom truoc (viec gap cua nguoi len tren, tinh trang he thong xuong duoi), roi theo
 * THOI GIAN TANG DAN trong nhom — thu doi lau nhat nam tren cung. Dong khong co thoi diem xep
 * sau dong co, va hai dong bang nhau thi phan xu bang `id`, de khong bao gio co hai lan chay
 * cho ra hai thu tu khac nhau.
 */
export function deriveAlerts(sources: AlertSources): readonly CustomerAlert[] {
  return [
    ...fromOrders(sources.orders),
    ...fromBlockedCapabilities(sources.blockedCapabilities),
    ...fromReadinessChecks(sources.readinessChecks),
    ...fromChannel(sources.channel),
  ].sort((left, right) => {
    const byCategory = CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (byCategory !== 0) return byCategory;
    const leftAt = left.at ? Date.parse(left.at) : Number.POSITIVE_INFINITY;
    const rightAt = right.at ? Date.parse(right.at) : Number.POSITIVE_INFINITY;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return left.id.localeCompare(right.id);
  });
}

export interface AlertGroup {
  readonly category: AlertCategory;
  readonly label: string;
  readonly alerts: readonly CustomerAlert[];
}

/** Nhom rong bi bo han — khong de lai mot tieu de treo lo lung, giong thanh dieu huong. */
export function groupAlerts(alerts: readonly CustomerAlert[]): readonly AlertGroup[] {
  return ALERT_CATEGORIES.map((category) => ({
    category,
    label: ALERT_CATEGORY_LABEL[category],
    alerts: alerts.filter((alert) => alert.category === category),
  })).filter((group) => group.alerts.length > 0);
}

export function alertsHeadline(alerts: readonly CustomerAlert[]): string {
  if (alerts.length === 0) return 'Không có cảnh báo nào đang mở.';
  const needsPerson = alerts.filter(
    (alert) => alert.category === 'can_duyet' || alert.category === 'can_nhap_don',
  ).length;
  if (needsPerson === 0) return `${alerts.length} cảnh báo đang mở.`;
  return `${alerts.length} cảnh báo đang mở, trong đó ${needsPerson} việc cần người xử lý ngay.`;
}
