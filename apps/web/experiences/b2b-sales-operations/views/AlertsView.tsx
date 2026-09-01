'use client';

import { EmptyState, Panel } from '../components/SectionState';
import {
  toChannelSignal,
  useMessageStream,
  useOperationalSummary,
  useReadiness,
} from '../hooks/useWorkspaceData';
import { useNavigationInput } from '../hooks/useNavigationInput';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { buildSectionUrl, type B2bSectionId } from '../navigation';
import {
  alertsHeadline,
  deriveAlerts,
  groupAlerts,
  type CustomerAlert,
} from '../workspace/alerts';

/**
 * CANH BAO — mot bang viec, khong phai mot bang den (Issue #110 §Cảnh báo).
 *
 * Bon nguon, va chung KHONG cung song chet voi nhau:
 *
 *   · nghiep vu khach khai la chua san sang -> doc tu goi khach, LUON co, ke ca khi mang chet;
 *   · don dang cho nguoi                    -> `/messages`;
 *   · cong go-live                          -> `/settings/readiness`;
 *   · tinh trang kenh                       -> `/settings/summary`.
 *
 * Nguon nao chua doc duoc thi NOI RA la chua doc duoc, va ba nguon con lai van hien. Gop chung
 * vao mot trang thai "đang tải" duy nhat se lam ca bang bien mat vi mot endpoint cham — dung kieu
 * im lang ma ca #107 §7 lan #110 cam.
 */

export interface AlertsViewProps {
  readonly onNavigate: (section: B2bSectionId, selection: string | null) => void;
}

export function AlertsView({ onNavigate }: AlertsViewProps) {
  const tenant = useTenantRuntime();
  const navigation = useNavigationInput();
  const messages = useMessageStream();
  const readiness = useReadiness();
  const summary = useOperationalSummary();

  const alerts = deriveAlerts({
    orders: messages.data ?? [],
    blockedCapabilities: tenant.readiness.blockedCapabilities,
    readinessChecks: readiness.data?.checks ?? null,
    channel: toChannelSignal(summary.data),
    navigation,
  });
  const groups = groupAlerts(alerts);

  const unreadSources = [
    messages.isSuccess ? null : 'việc đang chờ người xử lý',
    readiness.isSuccess ? null : 'điều kiện chạy thật',
    summary.isSuccess ? null : 'tình trạng kênh',
  ].filter((source): source is string => source !== null);

  return (
    <Panel
      title="Việc cần người xử lý"
      description="Tổng hợp từ hàng chờ duyệt, đơn chờ nhập, dữ liệu chưa sẵn sàng và tình trạng kênh."
    >
      <p className="b2b-headline">{alertsHeadline(alerts)}</p>

      {unreadSources.length > 0 ? (
        <p className="b2b-note" role="status">
          Chưa đọc được {unreadSources.join(', ')}. Những cảnh báo còn lại vẫn hiển thị đầy đủ.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title="Không có cảnh báo nào đang mở"
          detail="Khi có việc cần người xử lý, việc đó sẽ xuất hiện tại đây."
        />
      ) : (
        groups.map((group) => (
          <section key={group.category} className="b2b-alertgroup" aria-label={group.label}>
            <h3 className="b2b-alertgroup__title">
              {group.label}
              <span className="b2b-alertgroup__count">{group.alerts.length}</span>
            </h3>
            <ul className="b2b-alerts">
              {group.alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onNavigate={onNavigate} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Panel>
  );
}

function AlertRow({
  alert,
  onNavigate,
}: {
  alert: CustomerAlert;
  onNavigate: (section: B2bSectionId, selection: string | null) => void;
}) {
  return (
    <li className="b2b-alert">
      <div className="b2b-alert__body">
        <p className="b2b-alert__title">{alert.title}</p>
        <p className="b2b-alert__detail">{alert.detail}</p>
        {alert.notes.length > 0 ? (
          <ul className="b2b-notes">
            {alert.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {alert.link ? (
        <a
          className="b2b-alert__link"
          href={buildSectionUrl(alert.link.section, alert.link.selection)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            onNavigate(alert.link!.section, alert.link!.selection);
          }}
        >
          {alert.link.label}
        </a>
      ) : null}
    </li>
  );
}
