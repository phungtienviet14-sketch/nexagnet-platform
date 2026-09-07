'use client';

import { MetricCard, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useControlTower,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { toControlTower } from '../workspace/control-tower';

/**
 * BANG DIEU HANH — man hinh chinh cua Dieu do/Giam doc (#244 G2/G3).
 *
 * Man hinh nay CHI SAP XEP. Moi phep dem, moi cau chu va moi duong dan da duoc `toControlTower`
 * quyet o mot ham thuan co bai kiem — nen o day khong co mot phep `??`, mot phep cong hay mot cau
 * `if (role === ...)` nao. Do la cung khuon `OverviewView`, va no la thu giu cho hai luat sau kiem
 * duoc bang `.ts` thay vi bang mat:
 *
 *   · `null` km khong bao gio thanh `0`;
 *   · `id` ky thuat khong bao gio len dia chi.
 *
 * BA MUC KHONG DUOC GOP: viec dang cho (hang viec), nguon bi TAT (khach chua mua nghiep vu), va
 * viec CHUA THEO DOI DUOC (nen tang chua co nguon). Gop chung se lam mot bang thieu muc doc giong
 * het mot ngay khong co viec gi.
 */
export function ControlTowerView() {
  const navigation = useNavigationInput();
  const tower = toSectionQuery(useControlTower(navigation));

  if (!hasOperationsScope(navigation.role)) {
    return (
      <>
        <PageHeader title="Bảng điều hành" />
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      </>
    );
  }

  const model = tower.data === undefined ? null : toControlTower(tower.data);

  return (
    <>
      <PageHeader
        title="Bảng điều hành"
        summary="Vòng chạy theo bảy cột của quy trình, đội xe đang ở đâu, và hàng việc đang chờ người xử lý."
        context={model === null ? undefined : `Số liệu ngày ${model.generatedFor}`}
      />

      {tower.errorMessage === null ? null : (
        <ErrorState message={tower.errorMessage} onRetry={tower.refetch} />
      )}
      {tower.isLoading ? <LoadingState label="Đang đọc bảng điều hành…" /> : null}

      {model === null ? null : (
        <>
          <section className="tx-cards" aria-label="Đội xe và việc đang chờ">
            {model.stats.map((stat) => (
              <MetricCard
                key={stat.key}
                label={stat.label}
                value={stat.value}
                href={stat.section === null ? undefined : buildSectionUrl(stat.section)}
              />
            ))}
          </section>

          <section className="tx-panel" aria-label="Bảng vòng chạy">
            <h2>Vòng chạy hôm nay</h2>
            <div className="tx-board">
              {model.columns.map((column) => (
                <article
                  key={column.column}
                  className={
                    column.isAvailable ? 'tx-board__col' : 'tx-board__col tx-board__col--pending'
                  }
                  aria-label={column.label}
                >
                  <header className="tx-board__head">
                    <h3>{column.label}</h3>
                    <span className="tx-board__count">{column.total}</span>
                  </header>

                  {column.note === null ? null : <p className="tx-board__note">{column.note}</p>}

                  {column.isAvailable && column.cards.length === 0 ? (
                    <p className="tx-board__empty">Không có vòng chạy nào.</p>
                  ) : null}

                  <ul className="tx-board__cards">
                    {column.cards.map((card) => (
                      <li key={card.key}>
                        <a href={buildSectionUrl('movement', card.runCode)}>
                          <strong>{card.runCode}</strong>
                          <span>{card.legs}</span>
                          <span>{card.totalKm}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="tx-panel" aria-label="Hàng việc">
            <h2>Việc đang chờ người xử lý</h2>
            <p className="tx-panel__lead">{model.headline}</p>

            {model.hasWork ? (
              <ul className="tx-worklist">
                {model.queue.map((row) => (
                  <li key={row.key}>
                    <a href={buildSectionUrl(row.section, row.selection)}>
                      <span className={`tx-dot tx-dot--${row.tone}`} aria-hidden="true" />
                      {row.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Không có việc nào đang chờ xử lý." />
            )}
          </section>

          {model.disabledSourceNotes.length === 0 ? null : (
            <section className="tx-panel" aria-label="Nghiệp vụ chưa bật">
              <h2>Mục bảng không có, vì khách chưa bật nghiệp vụ</h2>
              <ul className="tx-notes">
                {model.disabledSourceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}

          {model.pendingWorkNotes.length === 0 ? null : (
            <section className="tx-panel" aria-label="Việc hệ thống chưa theo dõi được">
              <h2>Việc hệ thống chưa theo dõi được</h2>
              <ul className="tx-notes">
                {model.pendingWorkNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
