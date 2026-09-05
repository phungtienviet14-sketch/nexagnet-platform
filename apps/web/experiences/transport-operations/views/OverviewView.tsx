'use client';

import { gapsForSection } from '../api-gaps';
import { MetricCard, PageHeader } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useNavigationInput,
  useReconciliations,
  useTrips,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { toDashboard } from '../workspace/dashboard';

/**
 * BANG DIEU KHIEN — con so that, va ten cua nhung con so CHUA lay duoc.
 *
 * #161 §4.B cam bia the bao duong/tuan thu/luong truoc khi `TX-06`/`TX-07` co san, va chi cho lay
 * trang thai doi xe *"tu du lieu truoc T6 o cho nao noi that duoc"*. Nen khoi "Chua dung duoc" o
 * cuoi trang khong phai mot loi xin loi — no la phan quan trong nhat cua man hinh nay: no cho biet
 * con so nao KHONG co tren bang, de khong ai di tim mot con so khong ton tai.
 */
export function OverviewView() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useTrips(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const reconciliations = toSectionQuery(useReconciliations(navigation));

  if (!hasOperationsScope(navigation.role)) {
    return (
      <>
        <PageHeader title="Tổng quan" />
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      </>
    );
  }

  const firstError = trips.errorMessage ?? vehicles.errorMessage ?? drivers.errorMessage ?? null;
  const isLoading = trips.isLoading || vehicles.isLoading || drivers.isLoading;

  const model = toDashboard({
    trips: trips.data ?? [],
    vehicles: vehicles.data ?? [],
    drivers: drivers.data ?? [],
    reconciliations: reconciliations.data ?? [],
    capabilities: navigation.capabilities,
    role: navigation.role,
  });

  return (
    <>
      <PageHeader
        title="Tổng quan"
        summary="Chuyến đang chạy, đội xe, và những việc đang chờ người xử lý."
      />

      {firstError === null ? null : <ErrorState message={firstError} onRetry={trips.refetch} />}
      {isLoading ? <LoadingState label="Đang đọc số liệu vận hành…" /> : null}

      <section className="tx-cards" aria-label="Số liệu vận hành">
        {model.stats.map((stat) => (
          <MetricCard
            key={stat.key}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            href={stat.section === null ? undefined : buildSectionUrl(stat.section)}
          />
        ))}
      </section>

      <section className="tx-panel" aria-label="Cần xử lý ngay">
        <h2>Cần xử lý ngay</h2>
        <p className="tx-panel__lead">{model.headline}</p>
        {model.hasWork ? (
          <ul className="tx-worklist">
            {model.work.map((item) => (
              <li key={item.key}>
                <a href={buildSectionUrl(item.section, item.selection)}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="tx-panel tx-panel--muted" aria-label="Chưa dùng được">
        <h2>Chưa dùng được</h2>
        <p className="tx-panel__lead">
          Những con số dưới đây cố tình không có trên bảng, vì hôm nay chưa lấy ra được một cách
          trung thực.
        </p>
        <ul className="tx-unavailable">
          {model.unavailable.map((card) => (
            <li key={card.label}>
              <strong>{card.label}</strong>
              <span>{card.reason}</span>
            </li>
          ))}
        </ul>
        <details className="tx-details">
          <summary>Chi tiết kỹ thuật của các khoảng cách này</summary>
          <ul>
            {gapsForSection('overview').map((gap) => (
              <li key={gap.id}>
                <strong>{gap.title}</strong> — {gap.actual}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
