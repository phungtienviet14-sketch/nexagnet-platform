'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrderView } from '@netviet/shared';
import { api } from '../../../lib/api';
import { settingsApi } from '../../../lib/settings';
import type { PublicTenantDescriptor } from '../../../lib/tenant-runtime';
import { ErrorState, LoadingState, Panel, StatPanel } from '../components/SectionState';
import { summarizeWorkload, toCustomerOrders } from '../customer-view';
import { readinessHeadline, toCustomerReadiness } from '../readiness';

/**
 * TRANG TONG QUAN — be mat "noi that" cua Issue #107 §7.
 *
 * BA nguon, ba muc do chac chan khac nhau, va man hinh phai the hien dung su khac nhau do:
 *
 * 1. NANG LUC BI CHAN doc tu goi khach. Luon co, ke ca khi API chet. Day la loi khach tu khai.
 * 2. VIEC HOM NAY doc tu `/messages`. Do duoc thi co so, khong thi noi ro la khong doc duoc.
 * 3. CONG GO-LIVE doc tu `/settings/readiness`.
 *
 * Ba khoi co trang thai RIENG, khong gop. Gop lai thi mot lan API loi se lam bien mat ca cau "COD
 * chua san sang" — dung kieu im lang ma §7 cam.
 */
export interface OverviewViewProps {
  readonly tenant: PublicTenantDescriptor;
  readonly canUpdateSources: boolean;
}

export function OverviewView({ tenant, canUpdateSources }: OverviewViewProps) {
  const ordersQuery = useQuery({ queryKey: ['b2b', 'messages'], queryFn: api.messages });
  const readinessQuery = useQuery({
    queryKey: ['b2b', 'readiness'],
    queryFn: settingsApi.readiness,
  });

  const blocked = toCustomerReadiness(tenant.readiness.blockedCapabilities, { canUpdateSources });

  return (
    <div className="b2b-stack">
      <Panel
        title="Nghiệp vụ chưa sẵn sàng"
        description="Đọc trực tiếp từ cấu hình doanh nghiệp — không phụ thuộc kết nối."
      >
        <p className="b2b-headline">{readinessHeadline(blocked)}</p>
        {blocked.length > 0 ? (
          <ul className="b2b-readiness">
            {blocked.map((row) => (
              <li key={row.key} className="b2b-readiness__row">
                <div className="b2b-readiness__head">
                  <span className="b2b-readiness__label">{row.label}</span>
                  <span className="b2b-pill b2b-pill--blocked">{row.statusLabel}</span>
                </div>
                <p className="b2b-readiness__reason">{row.reason}</p>
                {row.action ? <p className="b2b-readiness__action">{row.action}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Việc hôm nay" description="Đếm trên tin nhắn hệ thống thực sự đã nhận.">
        {ordersQuery.isPending ? <LoadingState what="việc hôm nay" /> : null}
        {ordersQuery.isError ? <ErrorState what="việc hôm nay" /> : null}
        {ordersQuery.isSuccess ? <WorkloadStats orders={ordersQuery.data} /> : null}
      </Panel>

      <Panel
        title="Điều kiện chạy thật"
        description="Cổng kiểm tra của hệ thống trước khi doanh nghiệp chạy chính thức."
      >
        {readinessQuery.isPending ? <LoadingState what="điều kiện chạy thật" /> : null}
        {readinessQuery.isError ? <ErrorState what="điều kiện chạy thật" /> : null}
        {readinessQuery.isSuccess ? (
          <GoLiveGate
            goLiveReady={readinessQuery.data.goLiveReady}
            outstanding={
              readinessQuery.data.checks.filter(
                (check) => check.blocking && check.status !== 'ready',
              ).length
            }
          />
        ) : null}
      </Panel>
    </div>
  );
}

function WorkloadStats({ orders }: { orders: readonly OrderView[] }) {
  const summary = summarizeWorkload(toCustomerOrders(orders));
  if (summary.total === 0) {
    return (
      <p className="b2b-headline">
        Chưa có tin nhắn nào được ghi nhận. Số liệu sẽ xuất hiện ngay khi nhóm đầu tiên hoạt động.
      </p>
    );
  }
  return (
    <div className="b2b-stats">
      <StatPanel label="Chờ duyệt" value={String(summary.awaitingApproval)} hint="Cần người xem" />
      <StatPanel
        label="Chờ nhập đơn"
        value={String(summary.awaitingOrderEntry)}
        hint="Đã gửi khách"
      />
      <StatPanel label="Đã gửi hôm nay" value={String(summary.sentToday)} />
      <StatPanel label="Nhóm đang hoạt động" value={String(summary.groups)} />
    </div>
  );
}

function GoLiveGate({ goLiveReady, outstanding }: { goLiveReady: boolean; outstanding: number }) {
  return (
    <p className="b2b-headline">
      {goLiveReady
        ? 'Hệ thống đã đủ điều kiện chạy thật.'
        : `Còn ${outstanding} điều kiện bắt buộc chưa đạt trước khi chạy thật.`}
    </p>
  );
}
