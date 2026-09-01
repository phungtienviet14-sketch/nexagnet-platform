'use client';

import type { PublicTenantDescriptor } from '../../../lib/tenant-runtime';
import { ErrorState, LoadingState, Panel, StatPanel } from '../components/SectionState';
import {
  toChannelSignal,
  useMessageStream,
  useOperationalSummary,
  useReadiness,
} from '../hooks/useWorkspaceData';
import { useNavigationInput } from '../hooks/useNavigationInput';
import { buildSectionUrl, type B2bSectionId } from '../navigation';
import { readinessHeadline, toCustomerReadiness } from '../readiness';
import type { CustomerAlert } from '../workspace/alerts';
import { toDashboard, urgentHeadline, type DashboardModel } from '../workspace/dashboard';

/**
 * TONG QUAN — bang dieu khien cua mot ngay lam viec (Issue #110 §Dashboard).
 *
 * BON khoi, BON muc do chac chan khac nhau, va man hinh phai the hien dung su khac nhau do:
 *
 *   1. CAN XU LY NGAY  — tu `/messages`; moi dong dan thang toi cho lam viec do.
 *   2. VIEC HOM NAY    — tu `/messages`; con so bam duoc, khong phai so de ngam.
 *   3. NGHIEP VU CHUA SAN SANG — doc tu goi khach. Luon co, ke ca khi API chet.
 *   4. DIEU KIEN CHAY THAT     — tu `/settings/readiness`.
 *
 * Bon khoi co trang thai RIENG, khong gop. Gop lai thi mot lan API loi se lam bien mat ca cau
 * "COD chưa sẵn sàng" — dung kieu im lang ma Issue #107 §7 da cam va #110 nhac lai.
 */
export interface OverviewViewProps {
  readonly tenant: PublicTenantDescriptor;
  readonly canUpdateSources: boolean;
  readonly onNavigate: (section: B2bSectionId, selection: string | null) => void;
}

export function OverviewView({ tenant, canUpdateSources, onNavigate }: OverviewViewProps) {
  const ordersQuery = useMessageStream();
  const readinessQuery = useReadiness();
  const summaryQuery = useOperationalSummary();
  const navigation = useNavigationInput();

  const blocked = toCustomerReadiness(tenant.readiness.blockedCapabilities, { canUpdateSources });
  const dashboard = toDashboard({
    orders: ordersQuery.data ?? [],
    blockedCapabilities: tenant.readiness.blockedCapabilities,
    readinessChecks: readinessQuery.data?.checks ?? null,
    channel: toChannelSignal(summaryQuery.data),
    navigation,
  });

  return (
    <div className="b2b-stack">
      <Panel
        title="Cần xử lý ngay"
        description="Việc đang chờ một con người, xếp theo thứ tự đến trước làm trước."
      >
        {ordersQuery.isPending ? <LoadingState what="việc cần xử lý" /> : null}
        {ordersQuery.isError ? <ErrorState what="việc cần xử lý" /> : null}
        {ordersQuery.isSuccess ? (
          <UrgentWork model={dashboard} onNavigate={onNavigate} />
        ) : null}
      </Panel>

      <Panel title="Việc hôm nay" description="Đếm trên tin nhắn hệ thống thực sự đã nhận.">
        {ordersQuery.isPending ? <LoadingState what="việc hôm nay" /> : null}
        {ordersQuery.isError ? <ErrorState what="việc hôm nay" /> : null}
        {ordersQuery.isSuccess ? (
          <WorkloadStats model={dashboard} onNavigate={onNavigate} />
        ) : null}
      </Panel>

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

function UrgentWork({
  model,
  onNavigate,
}: {
  model: DashboardModel;
  onNavigate: (section: B2bSectionId, selection: string | null) => void;
}) {
  return (
    <>
      <p className="b2b-headline">{urgentHeadline(model)}</p>
      {model.urgent.length > 0 ? (
        <ul className="b2b-worklist">
          {model.urgent.map((alert) => (
            <UrgentRow key={alert.id} alert={alert} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function UrgentRow({
  alert,
  onNavigate,
}: {
  alert: CustomerAlert;
  onNavigate: (section: B2bSectionId, selection: string | null) => void;
}) {
  const link = alert.link!;
  return (
    <li className="b2b-work">
      <div className="b2b-work__body">
        <p className="b2b-work__title">{alert.title}</p>
        <p className="b2b-work__detail">{alert.detail}</p>
      </div>
      <a
        className="b2b-work__link"
        href={buildSectionUrl(link.section, link.selection)}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onNavigate(link.section, link.selection);
        }}
      >
        {link.label}
      </a>
    </li>
  );
}

/**
 * Con so BAM DUOC.
 *
 * Mot bang dieu khien ma con so khong dan di dau bat nguoi dung tu di tim lai chinh cai ho vua
 * doc — do la mot bang so, khong phai mot bang dieu khien.
 */
function WorkloadStats({
  model,
  onNavigate,
}: {
  model: DashboardModel;
  onNavigate: (section: B2bSectionId, selection: string | null) => void;
}) {
  const total = model.stats.reduce((sum, stat) => sum + stat.value, 0);
  if (total === 0) {
    return (
      <p className="b2b-headline">
        Chưa có tin nhắn nào được ghi nhận. Số liệu sẽ xuất hiện ngay khi nhóm đầu tiên hoạt động.
      </p>
    );
  }
  return (
    <div className="b2b-stats">
      {model.stats.map((stat) =>
        stat.link ? (
          <a
            key={stat.key}
            className="b2b-stat__link"
            href={buildSectionUrl(stat.link.section, null)}
            aria-label={`${stat.label}: ${stat.value}. ${stat.link.label}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onNavigate(stat.link!.section, null);
            }}
          >
            <StatPanel label={stat.label} value={String(stat.value)} hint={stat.hint} />
          </a>
        ) : (
          <StatPanel key={stat.key} label={stat.label} value={String(stat.value)} hint={stat.hint} />
        ),
      )}
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
