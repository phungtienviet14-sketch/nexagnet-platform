'use client';

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
 * BANG DIEU KHIEN — chi nhung con so DEM DUOC tu du lieu that dang co tren tay.
 *
 * #161 §4.B cam bia the bao duong/tuan thu/luong, va chi cho lay trang thai doi xe *"tu du lieu
 * truoc T6 o cho nao noi that duoc"*. Lenh cam do van nguyen: mot con so khong dem duoc thi KHONG
 * len bang, va tuyet doi khong duoc uoc doan cho day cho.
 *
 * TRUOC DAY cuoi trang con mot khoi "Chua dung duoc" liet ke ten cac con so thieu kem ly do ky
 * thuat cua tung cai. Khoi do da bo (#195): khong hien mot con so la du: no khong tuyen bo gi sai,
 * va no khong bat nguoi doc phai hieu kien truc may chu de dung mot bang dieu khien.
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
    </>
  );
}
