import type { OrderView } from '@netviet/shared';
import type { B2bSectionId } from '../navigation';
import { summarizeWorkload, toCustomerOrders } from '../customer-view';
import { deriveAlerts, type AlertSources, type CustomerAlert } from './alerts';

/**
 * TONG QUAN LAM DUOC VIEC — khong phai mot bang so de ngam (Issue #110 §Dashboard).
 *
 * Khac biet giua mot bang dieu khien va mot bang so: bang dieu khien tra loi "hom nay toi phai
 * lam gi TRUOC", va moi con so tren do phai DAN DEN mot cho lam viec. Mot con so khong bam duoc
 * bat nguoi dung tu di tim lai chinh cai ho vua doc.
 *
 * Moi con so o day dem tren DU LIEU THAT dang co. Khong doanh thu, khong ty le tang truong,
 * khong "hieu suat AI" — nen tang khong do nhung thu do, va Issue #110 cam bia chung ra.
 */

export interface DashboardStat {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Cau phu noi ro con so nay DEM CAI GI, de khong ai phai doan. */
  readonly hint: string;
  /** Cho de lam viec do; `null` khi con so chi de biet, khong co viec kem theo. */
  readonly link: { readonly section: B2bSectionId; readonly label: string } | null;
}

export interface DashboardModel {
  readonly stats: readonly DashboardStat[];
  /**
   * Hang viec dat len dau trang — chi nhung canh bao CO DUONG DI TOI CHO LAM.
   *
   * Mot dong trong "Cần xử lý ngay" ma bam vao khong di dau ca la mot loi hua sai: no doi nguoi
   * dung hanh dong roi khong chi cho ho hanh dong o dau.
   */
  readonly urgent: readonly CustomerAlert[];
  readonly totalAlerts: number;
  readonly hasWork: boolean;
}

/** Nhieu hon the nay thi "ngay" khong con nghia la ngay nua — phan con lai o muc Cảnh báo. */
export const URGENT_LIMIT = 6;

export function toDashboardStats(orders: readonly OrderView[]): readonly DashboardStat[] {
  const summary = summarizeWorkload(toCustomerOrders(orders));
  return [
    {
      key: 'awaiting-approval',
      label: 'Chờ duyệt & gửi',
      value: summary.awaitingApproval,
      hint: 'Phản hồi đã soạn xong, chờ người xác nhận.',
      link: { section: 'approvals', label: 'Mở hàng chờ duyệt' },
    },
    {
      key: 'awaiting-entry',
      label: 'Chờ nhập đơn',
      value: summary.awaitingOrderEntry,
      hint: 'Đã gửi cho nhóm, còn phải nhập vào phần mềm bán hàng.',
      link: { section: 'orders', label: 'Mở đơn hàng' },
    },
    {
      key: 'sent-today',
      label: 'Đã gửi hôm nay',
      value: summary.sentToday,
      hint: 'Tính theo ngày làm việc tại Việt Nam.',
      link: { section: 'orders', label: 'Mở đơn hàng' },
    },
    {
      key: 'active-groups',
      label: 'Nhóm đang hoạt động',
      value: summary.groups,
      hint: 'Nhóm đại lý đã có tin nhắn được ghi nhận.',
      link: { section: 'conversations', label: 'Mở hội thoại' },
    },
  ];
}

/**
 * VIEC PHAI LAM NGAY — lay tu chinh bo canh bao, khong tinh lai bang mot cong thuc thu hai.
 *
 * Neu trang Tong quan tu dem lay theo mot quy tac rieng, thi den ngay quy tac cua muc Cảnh báo
 * doi, hai man hinh se noi hai con so khac nhau ve cung mot ngay lam viec — va khong ai biet
 * ben nao dung. Mot nguon, hai cach hien.
 */
export function toDashboard(sources: AlertSources): DashboardModel {
  const alerts = deriveAlerts(sources);
  const urgent = alerts.filter((alert) => alert.link !== null).slice(0, URGENT_LIMIT);
  const stats = toDashboardStats(sources.orders);
  return {
    stats,
    urgent,
    totalAlerts: alerts.length,
    hasWork: urgent.length > 0,
  };
}

/**
 * Cau o dau muc "Cần xử lý ngay".
 *
 * Khi khong con viec nao, cau nay noi dung MOT dieu: khong con viec CAN NGUOI. No khong noi
 * "mọi thứ đều ổn" — cong go-live va nghiep vu chua san sang la hai cau hoi khac, tra loi o
 * cho khac tren cung trang nay.
 */
export function urgentHeadline(model: DashboardModel): string {
  if (model.urgent.length === 0) return 'Không có việc nào đang chờ người xử lý.';
  const hidden = model.totalAlerts - model.urgent.length;
  const lead = `${model.urgent.length} việc cần xử lý ngay`;
  return hidden > 0 ? `${lead} · còn ${hidden} cảnh báo khác ở mục Cảnh báo.` : `${lead}.`;
}
